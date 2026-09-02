import { getTrackIndexLookup } from "../../services/trackIndex";
import { useMemo, useState } from "react";

const MAX_COLLECTION_SEARCH_RESULTS = 40;

function normalizeSearchValue(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\bthe\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeSearch(value) {
  return normalizeSearchValue(value)
    .split(" ")
    .filter(Boolean);
}

function includesQuery(value, query) {
  const normalizedValue = normalizeSearchValue(value);
  const normalizedQuery = normalizeSearchValue(query);
  const queryTokens = tokenizeSearch(query);

  if (!normalizedQuery) {
    return true;
  }

  return normalizedValue.includes(normalizedQuery) || queryTokens.every((token) => normalizedValue.includes(token));
}

function getRecordReleaseId(record) {
  return String(record?.release_id || record?.releaseId || record?.["Release ID"] || "").trim();
}

function getAlbumGroupKey(record) {
  const artist = normalizeSearchValue(record?.Artist || "Unknown Artist");
  const title = normalizeSearchValue(record?.Title || "Unknown Album");

  return `${artist}|||${title}`;
}

function groupCollectionRecords(records) {
  const groups = new Map();

  records.forEach((record) => {
    if (!record?.Artist || !record?.Title) {
      return;
    }

    const groupKey = getAlbumGroupKey(record);
    const currentGroup = groups.get(groupKey);

    if (currentGroup) {
      currentGroup.records.push(record);
      return;
    }

    groups.set(groupKey, {
      key: groupKey,
      records: [record],
      record,
    });
  });

  return Array.from(groups.values());
}

function getIndexedTracks(recordGroup, trackLookup) {
  for (const record of recordGroup.records) {
    const releaseId = getRecordReleaseId(record);
    const releaseEntry = releaseId ? trackLookup.byReleaseId.get(releaseId) : null;
    const albumEntry = trackLookup.byArtistAlbum.get(getAlbumGroupKey(record));
    const tracks = releaseEntry?.tracks?.length ? releaseEntry.tracks : albumEntry?.tracks || [];

    if (tracks.length) {
      return tracks;
    }
  }

  return [];
}

function scoreAlbumGroup(recordGroup, libraryQuery, songQuery, trackLookup) {
  const record = recordGroup.record;
  const normalizedLibraryQuery = normalizeSearchValue(libraryQuery);
  const normalizedSongQuery = normalizeSearchValue(songQuery);
  const artist = normalizeSearchValue(record.Artist);
  const title = normalizeSearchValue(record.Title);
  const label = normalizeSearchValue(record.Label);
  const notes = normalizeSearchValue(record["Collection Notes"]);
  const albumText = `${artist} ${title} ${label} ${notes}`.trim();
  const indexedTracks = getIndexedTracks(recordGroup, trackLookup);
  const matchedTrack = normalizedSongQuery
    ? indexedTracks.find((trackTitle) => includesQuery(trackTitle, songQuery)) || ""
    : "";
  let score = 0;

  if (normalizedLibraryQuery) {
    if (artist === normalizedLibraryQuery) {
      score += 120;
    } else if (artist.startsWith(normalizedLibraryQuery)) {
      score += 95;
    } else if (artist.includes(normalizedLibraryQuery)) {
      score += 75;
    }

    if (title === normalizedLibraryQuery) {
      score += 90;
    } else if (title.includes(normalizedLibraryQuery)) {
      score += 55;
    }

    if (includesQuery(albumText, libraryQuery)) {
      score += 30;
    } else {
      return null;
    }
  }

  if (normalizedSongQuery) {
    if (matchedTrack) {
      score += 130;
    } else {
      return null;
    }
  }

  if (!normalizedLibraryQuery && !normalizedSongQuery) {
    return null;
  }

  return {
    groupKey: recordGroup.key,
    release_id: getRecordReleaseId(record),
    artist: record.Artist || "Unknown Artist",
    album: record.Title || "Unknown Album",
    year: record.Released || "Unknown",
    matchedTrack,
    duplicateCount: recordGroup.records.length,
    score,
    record,
  };
}

function searchCollection(records, trackIndex, libraryQuery, songQuery) {
  const trackLookup = getTrackIndexLookup(trackIndex);

  return groupCollectionRecords(records)
    .map((recordGroup) => scoreAlbumGroup(recordGroup, libraryQuery, songQuery, trackLookup))
    .filter(Boolean)
    .sort((firstResult, secondResult) => {
      if (secondResult.score !== firstResult.score) {
        return secondResult.score - firstResult.score;
      }

      const artistCompare = firstResult.artist.localeCompare(secondResult.artist);
      if (artistCompare) {
        return artistCompare;
      }

      return firstResult.album.localeCompare(secondResult.album);
    })
    .slice(0, MAX_COLLECTION_SEARCH_RESULTS);
}

function HomeTrackSearch({ records = [], trackIndex = [], onOpenAlbum }) {
  const [libraryQuery, setLibraryQuery] = useState("");
  const [songQuery, setSongQuery] = useState("");
  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const indexedAlbumCount = useMemo(() => trackIndex.length, [trackIndex]);

  function handleSubmit(event) {
    event.preventDefault();

    if (!libraryQuery.trim() && !songQuery.trim()) {
      setError("Enter an artist, album, or song title to search your collection.");
      setResults([]);
      setStatus("error");
      return;
    }

    const nextResults = searchCollection(records, trackIndex, libraryQuery, songQuery);

    setResults(nextResults);
    setStatus("success");
    setError(nextResults.length ? "" : songQuery.trim()
      ? "No indexed song match found yet. Open that album once, or rebuild the track index."
      : "No matching album found in your collection.");
  }

  function handleOpenAlbum(result) {
    if (!result?.record || !onOpenAlbum) {
      return;
    }

    onOpenAlbum(result.record);
  }

  function handleOpenYouTube(result) {
    const query = `${result?.artist || ""} ${result?.matchedTrack || ""} ${result?.album || ""}`.trim();
    const encodedSearch = encodeURIComponent(query);
    window.open(`https://music.youtube.com/search?q=${encodedSearch}`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="dashboard-track-search-results" aria-label="Collection search results">
      <form className="dashboard-home-search" onSubmit={handleSubmit}>
        <label htmlFor="home-search-library" className="sr-only">
          Search artist or album
        </label>
        <input
          id="home-search-library"
          type="search"
          className="dashboard-home-search__input"
          placeholder="Artist or album"
          value={libraryQuery}
          onChange={(event) => setLibraryQuery(event.target.value)}
        />
        <label htmlFor="home-search-song" className="sr-only">
          Search song title
        </label>
        <input
          id="home-search-song"
          type="search"
          className="dashboard-home-search__input"
          placeholder="Song title"
          value={songQuery}
          onChange={(event) => setSongQuery(event.target.value)}
        />
        <button type="submit" className="dashboard-home-search__button collection-button">
          Search Collection
        </button>
      </form>

      {error ? <p className="dashboard-track-search-results__status">{error}</p> : null}
      <p className="dashboard-track-search-results__status">
        Searching {records.length} collection albums with {indexedAlbumCount} indexed tracklists.
      </p>
      {results.length ? (
        <ul className="dashboard-track-search-results__list">
          {results.map((result) => (
            <li key={result.groupKey} className="dashboard-track-search-results__item">
              <div className="dashboard-track-search-results__meta">
                {result.matchedTrack ? (
                  <p className="dashboard-track-search-results__track">{result.matchedTrack}</p>
                ) : null}
                <p className="dashboard-track-search-results__album">{result.album}</p>
                <p className="dashboard-track-search-results__artist">
                  {result.artist}
                  {result.year ? ` • ${result.year}` : ""}
                  {result.duplicateCount > 1 ? ` • ${result.duplicateCount} copies` : ""}
                </p>
              </div>
              <div className="dashboard-track-search-results__actions">
                <button type="button" className="collection-button" onClick={() => handleOpenAlbum(result)}>
                  Open Album
                </button>
                <button type="button" className="surprise-button" onClick={() => handleOpenYouTube(result)}>
                  Play On YouTube
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : status === "success" ? null : null}
    </section>
  );
}

export default HomeTrackSearch;
