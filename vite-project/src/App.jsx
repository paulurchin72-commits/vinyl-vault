import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import Papa from "papaparse";
import { getRelease } from "./services/discogs";
import artworkManager from "./services/artworkManager";
import AlbumCard from "./components/AlbumCard";
import AlbumModal from "./components/AlbumModal";
import ArtistCollectionView from "./components/ArtistCollectionView";
import ArtistsDirectoryView from "./components/ArtistsDirectoryView";
import PlaceholderPage from "./components/PlaceholderPage";
import mmMonogramLogo from "./assets/mm-monogram-logo.svg";
import "./App.css";

function getTraceStore() {
  if (typeof globalThis === "undefined") {
    return null;
  }

  return globalThis;
}

function logTraceStage(stage, payload, options = {}) {
  const traceStore = getTraceStore();
  if (!traceStore) {
    return;
  }

  const traceAlbum = traceStore.__MM_TRACE_FIRST_ALBUM__;
  if (!traceAlbum) {
    return;
  }

  if (options.once) {
    traceStore.__MM_TRACE_ONCE__ ||= {};
    const onceKey = `${stage}:${traceAlbum.albumKey}`;
    if (traceStore.__MM_TRACE_ONCE__[onceKey]) {
      return;
    }
    traceStore.__MM_TRACE_ONCE__[onceKey] = true;
  }

  console.log(`[MM TRACE] ${stage}`, payload);
}

function isTracedAlbumKey(traceStore, albumKey) {
  return (
    traceStore?.__MM_TRACE_FIRST_ALBUM__?.albumKey === albumKey ||
    traceStore?.__MM_TRACE_SUCCESS_ALBUM__?.albumKey === albumKey
  );
}

const SAVED_MEMORIES_KEY = "the-memory-box:saved-memories";
const RECENTLY_VIEWED_KEY = "the-memory-box:recently-viewed";
const RECENTLY_VIEWED_LIMIT = 10;
const NAV_ITEMS = [
  { to: "/home", label: "🏠 Home" },
  { to: "/collection", label: "📀 Collection" },
  { to: "/artists", label: "🎤 Artists" },
  { to: "/favourites", label: "❤️ Favourites" },
  { to: "/top-rated", label: "⭐ Top Rated" },
  { to: "/insights", label: "📊 Insights" },
  { to: "/memories", label: "📝 Memories" },
  { to: "/settings", label: "⚙ Settings" },
];

function loadStoredJson(key, fallbackValue) {
  try {
    const storedValue = localStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function loadSavedMemories() {
  return loadStoredJson(SAVED_MEMORIES_KEY, {});
}

function loadRecentlyViewed() {
  const storedValue = loadStoredJson(RECENTLY_VIEWED_KEY, []);

  if (!Array.isArray(storedValue)) {
    return [];
  }

  return storedValue
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          albumKey: entry,
          artist: "",
          album: "",
          artwork: null,
          viewedAt: null,
        };
      }

      if (!entry || typeof entry !== "object" || !entry.albumKey) {
        return null;
      }

      return {
        albumKey: entry.albumKey,
        artist: entry.artist || "",
        album: entry.album || "",
        artwork: entry.artwork || null,
        viewedAt: entry.viewedAt || null,
      };
    })
    .filter(Boolean)
    .slice(0, RECENTLY_VIEWED_LIMIT);
}

function App() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [savedAlbumDetails, setSavedAlbumDetails] = useState(() => loadSavedMemories());
  const [surpriseSelection, setSurpriseSelection] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [collectionSort, setCollectionSort] = useState("artist-asc");
  const [recentlyViewed, setRecentlyViewed] = useState(() => loadRecentlyViewed());
  const [artworkEntries, setArtworkEntries] = useState(() => artworkManager.getSnapshot());
  const recentlyViewedAlbumKeys = recentlyViewed.map((entry) => entry.albumKey);

  useEffect(() => {
    Papa.parse("/Pault99-collection-20260803-1505.csv", {
      download: true,
      header: true,
      complete: (results) => {
        setRecords(
          results.data
            .filter((record) => record.Artist && record.Title)
            .map((record, rowIndex) => ({
              ...record,
              __rowIndex: rowIndex,
            }))
        );
      },
    });
  }, []);

  useEffect(() => {
  }, [records]);

  function getAlbumKey(album) {
    return album.albumKey || album.release_id || `${album.Artist}-${album.Title}-${album.Released}`;
  }

  function getRecordListKey(record) {
    const instanceId = record.instance_id || record.instanceId || record.InstanceID;

    if (instanceId) {
      return `instance-${instanceId}`;
    }

    return `${getAlbumKey(record)}::row-${record.__rowIndex}`;
  }

  function getAlbumCardId(albumKey) {
    return `album-card-${String(albumKey).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  }

  function getReleaseYear(record) {
    return Number(record.Released);
  }

  function getSavedAlbum(record) {
    return savedAlbumDetails[getAlbumKey(record)] || {};
  }

  function getArtworkEntry(record) {
    const albumKey = getAlbumKey(record);
    const entry = artworkEntries[albumKey] || {
      status: "idle",
      coverUrl: null,
      releaseData: null,
    };

    const traceStore = getTraceStore();
    if (isTracedAlbumKey(traceStore, albumKey)) {
      const snapshotKey = `${entry.status}|${entry.coverUrl || ""}`;
      if (traceStore.__MM_TRACE_LAST_GET_ARTWORK_ENTRY__ !== snapshotKey) {
        traceStore.__MM_TRACE_LAST_GET_ARTWORK_ENTRY__ = snapshotKey;
        logTraceStage("5.getArtworkEntry()", {
          albumKey,
          entry,
        });
      }
    }

    return entry;
  }

  function refreshArtworkEntries() {
    setArtworkEntries(artworkManager.getSnapshot());
  }

  function updateRecentlyViewedArtwork(albumKey, coverUrl) {
    if (!coverUrl) {
      return;
    }

    setRecentlyViewed((currentAlbums) => {
      let hasChanged = false;

      const nextAlbums = currentAlbums.map((entry) => {
        if (entry.albumKey !== albumKey || entry.artwork === coverUrl) {
          return entry;
        }

        hasChanged = true;
        return {
          ...entry,
          artwork: coverUrl,
        };
      });

      if (!hasChanged) {
        return currentAlbums;
      }

      try {
        localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(nextAlbums));
      } catch {
        // Ignore storage failures and keep the in-memory state update.
      }

      return nextAlbums;
    });
  }

  function handleAlbumCardVisible(record) {
    const albumKey = getAlbumKey(record);
    const albumWithKey = {
      ...record,
      albumKey,
    };

    const currentEntry = artworkManager.getEntry(albumKey);
    if (currentEntry.status === "loaded" || currentEntry.status === "missing") {
      return;
    }

    const request = artworkManager.ensureAlbumArtwork(albumWithKey, getRelease);
    refreshArtworkEntries();

    Promise.resolve(request).then((nextArtworkEntry) => {
      refreshArtworkEntries();
      updateRecentlyViewedArtwork(albumKey, nextArtworkEntry.coverUrl);

      setSelectedAlbum((currentAlbum) => {
        if (!currentAlbum || currentAlbum.albumKey !== albumKey) {
          return currentAlbum;
        }

        const savedDetails = savedAlbumDetails[albumKey] || {};
        return {
          ...currentAlbum,
          ...mergeAlbumWithArtwork(record, savedDetails, nextArtworkEntry),
          albumKey,
        };
      });
    });
  }

  function mergeAlbumWithArtwork(record, savedAlbum, artworkEntry) {
    return {
      ...record,
      ...savedAlbum,
      cover: artworkEntry.coverUrl,
      artworkStatus: artworkEntry.status,
      year: artworkEntry.releaseData?.year || record.Released,
      label: artworkEntry.releaseData?.label || record.Label || "",
      genres: artworkEntry.releaseData?.genres || record.genres || "",
    };
  }

  function formatViewedDateTime(value) {
    if (!value) {
      return "Recently viewed";
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return "Recently viewed";
    }

    return parsedDate.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  const searchQuery = search.toLowerCase();
  const searchMatchedRecords = records.filter((record) =>
    `${record.Artist} ${record.Title}`.toLowerCase().includes(searchQuery)
  );

  const quickFilters = [
    { id: "all", label: "All Records" },
    { id: "favorites", label: "❤️ Favourites" },
    { id: "rated5", label: "⭐ Rated 5 Stars" },
    { id: "memories", label: "📝 Has Memories" },
    { id: "1970s", label: "📅 1970s" },
    { id: "1980s", label: "📅 1980s" },
    { id: "1990s", label: "📅 1990s" },
    { id: "2000plus", label: "📅 2000+" },
    { id: "recent", label: "🎲 Recently Viewed" },
  ];

  function recordMatchesFilter(record, filterId) {
    const savedAlbum = getSavedAlbum(record);
    const releaseYear = getReleaseYear(record);
    const albumKey = getAlbumKey(record);

    switch (filterId) {
      case "favorites":
        return Boolean(savedAlbum.favorite);
      case "rated5":
        return Number(savedAlbum.rating) === 5;
      case "memories":
        return Boolean(savedAlbum.memory?.trim());
      case "1970s":
        return releaseYear >= 1970 && releaseYear <= 1979;
      case "1980s":
        return releaseYear >= 1980 && releaseYear <= 1989;
      case "1990s":
        return releaseYear >= 1990 && releaseYear <= 1999;
      case "2000plus":
        return releaseYear >= 2000;
      case "recent":
        return recentlyViewedAlbumKeys.includes(albumKey);
      case "all":
      default:
        return true;
    }
  }

  const filteredRecords = searchMatchedRecords.filter((record) =>
    recordMatchesFilter(record, activeFilter)
  );

  const sortedCollectionRecords = useMemo(() => {
    const sortedRecords = [...filteredRecords];

    sortedRecords.sort((firstRecord, secondRecord) => {
      const firstArtist = firstRecord.Artist || "Unknown Artist";
      const secondArtist = secondRecord.Artist || "Unknown Artist";
      const firstTitle = firstRecord.Title || "Unknown Album";
      const secondTitle = secondRecord.Title || "Unknown Album";
      const firstYear = Number(firstRecord.Released) || 0;
      const secondYear = Number(secondRecord.Released) || 0;

      switch (collectionSort) {
        case "artist-desc":
          return secondArtist.localeCompare(firstArtist) || secondTitle.localeCompare(firstTitle);
        case "album-asc":
          return firstTitle.localeCompare(secondTitle) || firstArtist.localeCompare(secondArtist);
        case "album-desc":
          return secondTitle.localeCompare(firstTitle) || secondArtist.localeCompare(firstArtist);
        case "year-newest":
          return secondYear - firstYear || firstArtist.localeCompare(secondArtist) || firstTitle.localeCompare(secondTitle);
        case "year-oldest":
          return firstYear - secondYear || firstArtist.localeCompare(secondArtist) || firstTitle.localeCompare(secondTitle);
        case "artist-asc":
        default:
          return firstArtist.localeCompare(secondArtist) || firstTitle.localeCompare(secondTitle);
      }
    });

    return sortedRecords;
  }, [filteredRecords, collectionSort]);

  const filterCounts = quickFilters.reduce((counts, filter) => {
    counts[filter.id] = searchMatchedRecords.filter((record) =>
      recordMatchesFilter(record, filter.id)
    ).length;
    return counts;
  }, {});

  const collectionStats = (() => {
    const artistCounts = new Map();
    const releaseYears = [];
    let favouriteCount = 0;
    let ratingTotal = 0;
    let ratingCount = 0;

    records.forEach((record) => {
      const albumKey = getAlbumKey(record);
      const savedDetails = savedAlbumDetails[albumKey] || {};
      const artist = record.Artist || "Unknown Artist";
      const releaseYear = Number(record.Released);

      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);

      if (Number.isFinite(releaseYear) && releaseYear > 0) {
        releaseYears.push(releaseYear);
      }

      if (savedDetails.favorite) {
        favouriteCount += 1;
      }

      const numericRating = Number(savedDetails.rating);
      if (Number.isFinite(numericRating) && numericRating > 0) {
        ratingTotal += numericRating;
        ratingCount += 1;
      }
    });

    const mostCollectedArtist = Array.from(artistCounts.entries()).sort(
      (firstEntry, secondEntry) => secondEntry[1] - firstEntry[1]
    )[0]?.[0] || "N/A";

    const oldestReleaseYear = releaseYears.length ? Math.min(...releaseYears) : "N/A";
    const newestReleaseYear = releaseYears.length ? Math.max(...releaseYears) : "N/A";
    const averageRating = ratingCount ? (ratingTotal / ratingCount).toFixed(1) : "N/A";

    return {
      totalRecords: records.length,
      totalArtists: artistCounts.size,
      favouriteRecords: favouriteCount,
      averageRating,
      mostCollectedArtist,
      oldestReleaseYear,
      newestReleaseYear,
    };
  })();

  const collectionStatItems = [
    { icon: "📀", label: "Total Records", value: collectionStats.totalRecords },
    {
      icon: "📀",
      label: "Collection Size",
      value: collectionStats.totalRecords,
      detail: "Total Albums",
    },
    {
      icon: "🎤",
      label: "Artists",
      value: collectionStats.totalArtists,
      detail: "Total unique artists",
    },
    { icon: "❤️", label: "Favourite Records", value: collectionStats.favouriteRecords },
    {
      icon: "⭐",
      label: "Average Rating",
      value: collectionStats.averageRating,
      detail: "Rated albums only",
    },
    { icon: "🎤", label: "Most Collected Artist", value: collectionStats.mostCollectedArtist },
    { icon: "📅", label: "Oldest Release Year", value: collectionStats.oldestReleaseYear },
    { icon: "📅", label: "Newest Release Year", value: collectionStats.newestReleaseYear },
  ];

  function getCollectionValueStats(collection) {
    const placeholderAverageValue = "£18.00";
    const placeholderCollectionValue = `£${(collection.length * 18).toLocaleString()}`;

    return {
      estimatedCollectionValue: `${placeholderCollectionValue}*`,
      averageAlbumValue: `${placeholderAverageValue}*`,
      mostValuableAlbum: "Live Discogs data coming soon*",
    };
  }

  const collectionValueStats = getCollectionValueStats(records);
  const collectionValueItems = [
    {
      icon: "💷",
      label: "Estimated Collection Value",
      value: collectionValueStats.estimatedCollectionValue,
      note: "Placeholder until live marketplace values are connected",
    },
    {
      icon: "📀",
      label: "Average Album Value",
      value: collectionValueStats.averageAlbumValue,
      note: "Calculated from a temporary estimate model",
    },
    {
      icon: "💎",
      label: "Most Valuable Album",
      value: collectionValueStats.mostValuableAlbum,
      note: "Ready for live Discogs pricing later",
    },
  ];

  const todayAlbum = useMemo(() => {
    if (!records.length) {
      return null;
    }

    const today = new Date();
    const dateSeed = `${today.getUTCFullYear()}-${today.getUTCMonth() + 1}-${today.getUTCDate()}`;
    let hash = 0;

    for (let index = 0; index < dateSeed.length; index += 1) {
      hash = (hash << 5) - hash + dateSeed.charCodeAt(index);
      hash |= 0;
    }

    const albumIndex = Math.abs(hash) % records.length;
    return records[albumIndex];
  }, [records]);

  const favouriteRecords = records.filter((record) => {
    const savedDetails = savedAlbumDetails[getAlbumKey(record)] || {};
    return Boolean(savedDetails.favorite);
  });

  const topRatedRecords = records.filter((record) => {
    const savedDetails = savedAlbumDetails[getAlbumKey(record)] || {};
    return Number(savedDetails.rating) === 5;
  });

  const memoriesByArtist = useMemo(() => {
    const groupedMemories = new Map();

    records.forEach((record) => {
      const albumKey = getAlbumKey(record);
      const savedDetails = savedAlbumDetails[albumKey] || {};
      const memoryText = savedDetails.memory?.trim();

      if (!memoryText) {
        return;
      }

      const artist = record.Artist || "Unknown Artist";
      if (!groupedMemories.has(artist)) {
        groupedMemories.set(artist, []);
      }

      groupedMemories.get(artist).push({
        albumKey,
        recordKey: getRecordListKey(record),
        title: record.Title,
        released: record.Released,
        memory: memoryText,
        record,
      });
    });

    return Array.from(groupedMemories.entries())
      .map(([artist, entries]) => ({ artist, entries }))
      .sort((firstGroup, secondGroup) => firstGroup.artist.localeCompare(secondGroup.artist));
  }, [records, savedAlbumDetails]);

  async function testDiscogs() {
    try {
      const album = await getRelease(249504);
      setMessage(`✅ Connected! Album: ${album.title}`);
    } catch (error) {
      setMessage(`❌ ${error.message}`);
    }
  }

  function openArtistView(artistName) {
    if (!artistName) {
      return;
    }

    setSelectedAlbum(null);
    navigate(`/artists/${encodeURIComponent(artistName)}`);
  }

  function closeArtistView() {
    navigate("/artists");
  }

  async function surpriseMe() {
    if (!records.length) {
      return;
    }

    const randomRecord = records[Math.floor(Math.random() * records.length)];
    const albumKey = getAlbumKey(randomRecord);

    setSurpriseSelection({
      albumKey,
      token: Date.now(),
    });

    await openAlbum(randomRecord);
  }

  async function openAlbum(record) {
    const albumKey = getAlbumKey(record);
    const savedDetails = savedAlbumDetails[albumKey] || {};
    const artworkEntry = getArtworkEntry(record);
    const viewedAt = new Date().toISOString();
    const initialArtwork = artworkEntry.coverUrl || record.cover || record.thumb || null;

    setSelectedAlbum({
      ...mergeAlbumWithArtwork(record, savedDetails, artworkEntry),
      albumKey,
    });

    setRecentlyViewed((currentAlbums) => {
      const nextAlbums = [
        {
          albumKey,
          artist: record.Artist || "Unknown Artist",
          album: record.Title || "Unknown Album",
          artwork: initialArtwork,
          viewedAt,
        },
        ...currentAlbums.filter((entry) => entry.albumKey !== albumKey),
      ].slice(0, RECENTLY_VIEWED_LIMIT);

      try {
        localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(nextAlbums));
      } catch {
        // Ignore storage failures and keep the in-memory state update.
      }

      return nextAlbums;
    });
  }

  async function openRecentlyViewedAlbum(recentEntry) {
    const matchingRecord = records.find((record) => getAlbumKey(record) === recentEntry.albumKey);

    if (matchingRecord) {
      await openAlbum(matchingRecord);
      return;
    }

    await openAlbum({
      albumKey: recentEntry.albumKey,
      Artist: recentEntry.artist || "Unknown Artist",
      Title: recentEntry.album || "Unknown Album",
      Released: "Unknown",
      cover: recentEntry.artwork || null,
      thumb: recentEntry.artwork || null,
    });
  }

  function saveAlbumDetails(details) {
    if (!details?.albumKey) {
      return;
    }

    setSavedAlbumDetails((currentDetails) => {
      const nextDetails = {
        ...currentDetails,
        [details.albumKey]: {
          memory: details.memory,
          favorite: details.favorite,
          rating: details.rating,
        },
      };

      try {
        localStorage.setItem(SAVED_MEMORIES_KEY, JSON.stringify(nextDetails));
      } catch {
        // Ignore storage failures and keep the in-memory state update.
      }

      return nextDetails;
    });

    setSelectedAlbum((currentAlbum) =>
      currentAlbum && currentAlbum.albumKey === details.albumKey
        ? {
            ...currentAlbum,
            memory: details.memory,
            favorite: details.favorite,
            rating: details.rating,
          }
        : currentAlbum
    );
  }

  function saveAlbumMetadata(details) {
    if (!details?.albumKey) {
      return;
    }

    setSavedAlbumDetails((currentDetails) => {
      const currentEntry = currentDetails[details.albumKey] || {};
      const nextDetails = {
        ...currentDetails,
        [details.albumKey]: {
          ...currentEntry,
          favorite: details.favorite,
          rating: details.rating,
        },
      };

      try {
        localStorage.setItem(SAVED_MEMORIES_KEY, JSON.stringify(nextDetails));
      } catch {
        // Ignore storage failures and keep the in-memory state update.
      }

      return nextDetails;
    });

    setSelectedAlbum((currentAlbum) =>
      currentAlbum && currentAlbum.albumKey === details.albumKey
        ? {
            ...currentAlbum,
            favorite: details.favorite,
            rating: details.rating,
          }
        : currentAlbum
    );
  }

  function closeAlbum() {
    setSelectedAlbum(null);
  }

  function handleRecentlyPlayedArtistClick(event, artistName) {
    event.stopPropagation();
    openArtistView(artistName);
  }

  function clearRecentlyPlayed() {
    const shouldClear = window.confirm("Clear your Recently Played list?");

    if (!shouldClear) {
      return;
    }

    setRecentlyViewed([]);

    try {
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify([]));
    } catch {
      // Ignore storage failures and keep the in-memory state update.
    }
  }

  useEffect(() => {
    if (!surpriseSelection?.albumKey) {
      return;
    }

    const cardElement = document.getElementById(getAlbumCardId(surpriseSelection.albumKey));

    cardElement?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    const timeoutId = window.setTimeout(() => {
      setSurpriseSelection(null);
    }, 1400);

    return () => window.clearTimeout(timeoutId);
  }, [surpriseSelection]);

  useEffect(() => {
    const traceStore = getTraceStore();
    if (traceStore && !traceStore.__MM_TRACE_FIRST_ALBUM__ && filteredRecords.length) {
      const firstQueuedRecord = filteredRecords[0];
      traceStore.__MM_TRACE_FIRST_ALBUM__ = {
        albumKey: getAlbumKey(firstQueuedRecord),
        release_id: firstQueuedRecord.release_id || null,
      };

      console.log("[MM TRACE] 1.albumKey / 2.release_id", traceStore.__MM_TRACE_FIRST_ALBUM__);
    }
  }, [filteredRecords]);

  function renderAlbumGrid(recordList, hintText, highlightBySurprise = false) {
    if (!recordList.length) {
      return <p className="empty-state">No albums match this view yet.</p>;
    }

    return (
      <>
        <div className="results-row">
          <h2 className="results-row__title">{recordList.length} Records</h2>
          <p className="results-row__hint">{hintText}</p>
        </div>

        <ul className="collection-grid">
          {recordList.map((record) => {
            const albumKey = getAlbumKey(record);
            const savedDetails = savedAlbumDetails[albumKey] || {};

            return (
              <AlbumCard
                key={getRecordListKey(record)}
                record={record}
                onClick={openAlbum}
                onArtistClick={openArtistView}
                onVisible={handleAlbumCardVisible}
                id={getAlbumCardId(albumKey)}
                highlighted={highlightBySurprise && surpriseSelection?.albumKey === albumKey}
                favorite={savedDetails.favorite}
                rating={savedDetails.rating}
                cover={getArtworkEntry(record).coverUrl}
                artworkStatus={getArtworkEntry(record).status}
              />
            );
          })}
        </ul>
      </>
    );
  }

  function renderRecentlyPlayedSection() {
    return (
      <section className="recently-played-panel glass-panel" aria-label="Recently played albums">
        <div className="recently-played-heading">
          <div className="section-heading">
            <p className="section-heading__eyebrow">Latest Spins</p>
            <h2 className="section-heading__title">🎵 Recently Played</h2>
          </div>

          <button
            type="button"
            className="recently-played-clear"
            onClick={clearRecentlyPlayed}
            disabled={!recentlyViewed.length}
          >
            Clear Recently Played
          </button>
        </div>

        {recentlyViewed.length ? (
          <ul className="recently-played-grid">
            {recentlyViewed.map((entry) => (
              <li key={entry.albumKey}>
                <article
                  role="button"
                  tabIndex={0}
                  className="recently-played-card"
                  onClick={() => openRecentlyViewedAlbum(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openRecentlyViewedAlbum(entry);
                    }
                  }}
                >
                  <div className="recently-played-card__art">
                    {entry.artwork ? (
                      <img
                        src={entry.artwork}
                        alt={`${entry.album || "Album"} artwork`}
                        className="recently-played-card__image"
                      />
                    ) : (
                      <div className="artwork-state artwork-state--placeholder" aria-label="No artwork available">
                        <span className="artwork-state__monogram">M&amp;M</span>
                        <span className="artwork-state__label">Music &amp; Memories</span>
                      </div>
                    )}
                  </div>

                  <div className="recently-played-card__body">
                    <p className="recently-played-card__artist">
                      <button
                        type="button"
                        className="artist-link-button"
                        onClick={(event) => handleRecentlyPlayedArtistClick(event, entry.artist)}
                      >
                        {entry.artist || "Unknown Artist"}
                      </button>
                    </p>
                    <p className="recently-played-card__album">{entry.album || "Unknown Album"}</p>
                    <p className="recently-played-card__time">{formatViewedDateTime(entry.viewedAt)}</p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className="recently-played-empty">Open any album to start your Recently Played list.</p>
        )}
      </section>
    );
  }

  function HomePage() {
    const todayArtwork = todayAlbum ? getArtworkEntry(todayAlbum).coverUrl : null;

    return (
      <>
        <section className="glass-panel home-welcome">
          <div className="section-heading">
            <p className="section-heading__eyebrow">Welcome</p>
            <h2 className="section-heading__title">Your Music &amp; Memories Home</h2>
          </div>
          <p className="home-welcome__copy">
            Explore your collection stories, rediscover records you played recently, and uncover a fresh album each day.
          </p>
        </section>

        <section className="home-feature-grid">
          <article className="glass-panel today-album-card">
            <div className="section-heading">
              <p className="section-heading__eyebrow">Today&apos;s Album</p>
              <h2 className="section-heading__title">A daily vinyl pick</h2>
            </div>

            {todayAlbum ? (
              <div className="today-album-card__content">
                <div className="today-album-card__art">
                  {todayArtwork ? (
                    <img src={todayArtwork} alt={todayAlbum.Title} className="today-album-card__image" />
                  ) : (
                    <div className="artwork-state artwork-state--placeholder" aria-label="No artwork available">
                      <span className="artwork-state__monogram">M&amp;M</span>
                      <span className="artwork-state__label">Music &amp; Memories</span>
                    </div>
                  )}
                </div>

                <div>
                  <p className="today-album-card__artist">{todayAlbum.Artist}</p>
                  <p className="today-album-card__title">{todayAlbum.Title}</p>
                  <button type="button" className="collection-button" onClick={() => openAlbum(todayAlbum)}>
                    Open Album
                  </button>
                </div>
              </div>
            ) : (
              <p className="empty-state">Loading daily album...</p>
            )}
          </article>

          <article className="glass-panel surprise-panel">
            <div className="section-heading">
              <p className="section-heading__eyebrow">Today&apos;s Surprise</p>
              <h2 className="section-heading__title">Spin something unexpected</h2>
            </div>
            <p className="surprise-panel__copy">Pick a random album instantly and jump into its full details popup.</p>
            <button onClick={surpriseMe} className="surprise-button surprise-button--wide">
              🎲 Surprise Me
            </button>
          </article>
        </section>

        <section className="dashboard-stack">
          <div className="section-heading">
            <p className="section-heading__eyebrow">Dashboard</p>
            <h2 className="section-heading__title">Collection overview</h2>
          </div>

          <section className="stats-grid">
            {collectionStatItems.map((stat) => (
              <article key={stat.label} className="glass-card stat-card">
                <div className="stat-card__label">
                  <span className="stat-card__icon">{stat.icon}</span>
                  <span>{stat.label}</span>
                </div>
                {stat.detail ? <p className="stat-card__detail">{stat.detail}</p> : null}
                <div
                  className={`stat-card__value${
                    stat.label === "Most Collected Artist" ? " stat-card__value--artist" : ""
                  }`}
                >
                  {stat.label === "Most Collected Artist" && stat.value !== "N/A" ? (
                    <button type="button" className="artist-link-button" onClick={() => openArtistView(stat.value)}>
                      {stat.value}
                    </button>
                  ) : (
                    stat.value
                  )}
                </div>
              </article>
            ))}
          </section>

          <section className="value-panel glass-panel">
            <div className="section-heading">
              <p className="section-heading__eyebrow">Collection Value</p>
              <h2 className="section-heading__title">Estimated marketplace snapshot</h2>
            </div>

            <div className="value-grid">
              {collectionValueItems.map((stat) => (
                <article key={stat.label} className="glass-card value-card">
                  <div className="stat-card__label">
                    <span className="stat-card__icon">{stat.icon}</span>
                    <span>{stat.label}</span>
                  </div>
                  <div
                    className={`value-card__value${
                      stat.label === "Most Valuable Album" ? " value-card__value--album" : ""
                    }`}
                  >
                    {stat.value}
                  </div>
                  <p className="value-card__note">{stat.note}</p>
                </article>
              ))}
            </div>
          </section>
        </section>

        {renderRecentlyPlayedSection()}
        {message && <p className="status-message">{message}</p>}
      </>
    );
  }

  function renderCollectionPage() {
    return (
      <>
        <div className="app-toolbar app-toolbar--search">
          <input
            type="text"
            placeholder="🔍 Search your collection..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="collection-search"
          />

          <button onClick={testDiscogs} className="collection-button">
            Test Discogs
          </button>

          <select
            value={collectionSort}
            onChange={(event) => setCollectionSort(event.target.value)}
            className="collection-sort"
            aria-label="Sort collection"
          >
            <option value="artist-asc">Artist (A–Z)</option>
            <option value="artist-desc">Artist (Z–A)</option>
            <option value="album-asc">Album (A–Z)</option>
            <option value="album-desc">Album (Z–A)</option>
            <option value="year-newest">Year (Newest)</option>
            <option value="year-oldest">Year (Oldest)</option>
          </select>
        </div>

        <div className="filter-bar" role="toolbar" aria-label="Quick collection filters">
          {quickFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`filter-chip${activeFilter === filter.id ? " is-active" : ""}`}
              onClick={() => setActiveFilter(filter.id)}
            >
              <span className="filter-chip__label">{filter.label}</span>
              <span className="filter-chip__count">{filterCounts[filter.id] || 0}</span>
            </button>
          ))}
        </div>

        {message && <p className="status-message">{message}</p>}
        {renderAlbumGrid(sortedCollectionRecords, "Premium dark glass collection view", true)}
      </>
    );
  }

  function FavouritesPage() {
    return (
      <section className="page-section">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Curated</p>
          <h2 className="section-heading__title">❤️ Favourite Albums</h2>
        </div>
        {renderAlbumGrid(favouriteRecords, "Albums marked as favourites")}
      </section>
    );
  }

  function TopRatedPage() {
    return (
      <section className="page-section">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Best Rated</p>
          <h2 className="section-heading__title">⭐ 5-Star Albums</h2>
        </div>
        {renderAlbumGrid(topRatedRecords, "Albums rated 5 stars")}
      </section>
    );
  }

  function MemoriesPage() {
    return (
      <section className="memories-page" aria-label="Saved memories by artist">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Reflections</p>
          <h2 className="section-heading__title">📝 Memories by Artist</h2>
        </div>

        {memoriesByArtist.length ? (
          <div className="memories-groups">
            {memoriesByArtist.map((group) => (
              <article key={group.artist} className="glass-panel memories-group">
                <h3 className="memories-group__artist">
                  <button type="button" className="artist-link-button" onClick={() => openArtistView(group.artist)}>
                    {group.artist}
                  </button>
                </h3>

                <ul className="memories-group__list">
                  {group.entries.map((entry) => (
                    <li key={entry.recordKey} className="memories-group__item">
                      <button
                        type="button"
                        className="memories-group__album"
                        onClick={() => openAlbum(entry.record)}
                      >
                        {entry.title} {entry.released ? `(${entry.released})` : ""}
                      </button>
                      <p className="memories-group__text">{entry.memory}</p>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No memories saved yet. Add memories from any album popup.</p>
        )}
      </section>
    );
  }

  function ArtistsRoute() {
    const params = useParams();
    const selectedArtist = params.artistName ? decodeURIComponent(params.artistName) : "";

    if (selectedArtist) {
      return (
        <ArtistCollectionView
          artistName={selectedArtist}
          records={records}
          savedAlbumDetails={savedAlbumDetails}
          getAlbumKey={getAlbumKey}
          getRecordListKey={getRecordListKey}
          getArtworkEntry={getArtworkEntry}
          onAlbumVisible={handleAlbumCardVisible}
          onAlbumOpen={openAlbum}
          onBack={closeArtistView}
          onArtistClick={openArtistView}
        />
      );
    }

    return <ArtistsDirectoryView records={records} onArtistClick={openArtistView} />;
  }

  return (
    <div className="app-shell">
      <div className="app-layout">
        <aside className="app-nav app-nav--desktop" aria-label="Main navigation">
          <div className="glass-panel app-nav__panel">
            <h2 className="app-nav__title">Navigate</h2>
            <ul className="app-nav__list">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) => `app-nav__button${isActive ? " is-active" : ""}`}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="app-shell__inner">
          <header className="app-hero">
            <p className="app-kicker">Music & Memories</p>
            <h1 className="app-title">
              <img src={mmMonogramLogo} alt="M&amp;M" className="app-title__logo" />
              <span>Music &amp; Memories</span>
            </h1>
            <p className="app-tagline">Every record has a story.</p>
          </header>

          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/collection" element={renderCollectionPage()} />
            <Route path="/artists" element={<ArtistsRoute />} />
            <Route path="/artists/:artistName" element={<ArtistsRoute />} />
            <Route path="/favourites" element={<FavouritesPage />} />
            <Route path="/top-rated" element={<TopRatedPage />} />
            <Route
              path="/insights"
              element={
                <PlaceholderPage
                  title="📊 Insights"
                  eyebrow="Coming Soon"
                  description="Expanded collection statistics and visual analytics will be available in a future release."
                />
              }
            />
            <Route path="/memories" element={<MemoriesPage />} />
            <Route
              path="/settings"
              element={
                <PlaceholderPage
                  title="⚙ Settings"
                  eyebrow="Coming Soon"
                  description="Application settings and personalization controls are prepared for upcoming builds."
                />
              }
            />
          </Routes>

          <nav className="app-nav app-nav--mobile" aria-label="Bottom navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `app-nav__button app-nav__button--mobile${isActive ? " is-active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <AlbumModal
            album={selectedAlbum}
            onClose={closeAlbum}
            onSave={saveAlbumDetails}
            onMetadataChange={saveAlbumMetadata}
            onArtistClick={openArtistView}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
