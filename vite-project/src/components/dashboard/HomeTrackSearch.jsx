import { useState } from "react";
import { searchDiscogsTracks } from "../../services/discogs";

function HomeTrackSearch({ onOpenAlbum }) {
  const [artistQuery, setArtistQuery] = useState("");
  const [trackTitleQuery, setTrackTitleQuery] = useState("");
  const [status, setStatus] = useState("idle");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    const normalizedTrackTitle = trackTitleQuery.trim();
    if (!normalizedTrackTitle) {
      setError("Enter a song title to run a deep search.");
      setResults([]);
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");

    try {
      const matches = await searchDiscogsTracks({
        artist: artistQuery,
        track: normalizedTrackTitle,
      });

      setResults(matches);
      setStatus("success");

      if (!matches.length) {
        setError("No album match found for that artist/song combination.");
      }
    } catch (nextError) {
      setResults([]);
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Deep search failed.");
    }
  }

  function handleOpenAlbum(result) {
    if (!result || !onOpenAlbum) {
      return;
    }

    onOpenAlbum({
      Artist: result.artist || "Unknown Artist",
      Title: result.album || "Unknown Album",
      Released: result.year || "Unknown",
      Label: result.label || "",
      release_id: result.release_id || null,
      cover: result.cover || result.thumb || null,
      thumb: result.thumb || result.cover || null,
      genres: "",
      __rowIndex: `track-result-${result.release_id || Date.now()}`,
    });
  }

  function handleOpenYouTube(result) {
    const query = `${result?.artist || ""} ${result?.matchedTrack || ""} ${result?.album || ""}`.trim();
    const encodedSearch = encodeURIComponent(query);
    window.open(`https://music.youtube.com/search?q=${encodedSearch}`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="dashboard-track-search-results" aria-label="Track search results">
      <form className="dashboard-home-search" onSubmit={handleSubmit}>
        <label htmlFor="home-search-artist" className="sr-only">
          Search artist
        </label>
        <input
          id="home-search-artist"
          type="search"
          className="dashboard-home-search__input"
          placeholder="Artist (optional)"
          value={artistQuery}
          onChange={(event) => setArtistQuery(event.target.value)}
        />
        <label htmlFor="home-search-track" className="sr-only">
          Search track
        </label>
        <input
          id="home-search-track"
          type="search"
          className="dashboard-home-search__input"
          placeholder="Song title"
          value={trackTitleQuery}
          onChange={(event) => setTrackTitleQuery(event.target.value)}
        />
        <button type="submit" className="dashboard-home-search__button collection-button">
          {status === "loading" ? "Searching..." : "Deep Search"}
        </button>
      </form>

      {error ? <p className="dashboard-track-search-results__status">{error}</p> : null}
      {results.length ? (
        <ul className="dashboard-track-search-results__list">
          {results.map((result) => (
            <li key={`${result.release_id}-${result.matchedTrack}`} className="dashboard-track-search-results__item">
              <div className="dashboard-track-search-results__meta">
                <p className="dashboard-track-search-results__track">{result.matchedTrack}</p>
                <p className="dashboard-track-search-results__album">{result.album}</p>
                <p className="dashboard-track-search-results__artist">
                  {result.artist}
                  {result.year ? ` • ${result.year}` : ""}
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
      ) : null}
    </section>
  );
}

export default HomeTrackSearch;