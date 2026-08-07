import { useState } from "react";
import { searchDiscogsReleases } from "../services/discogs";

function AddMusicPage({ onAddRecord }) {
  const [barcode, setBarcode] = useState("");
  const [albumQuery, setAlbumQuery] = useState("");
  const [artistQuery, setArtistQuery] = useState("");
  const [releaseIdQuery, setReleaseIdQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [scanMessage, setScanMessage] = useState("");

  async function runSearch(overrides = {}) {
    setStatus("loading");
    setError("");
    setSuccessMessage("");

    try {
      const nextResults = await searchDiscogsReleases({
        barcode: overrides.barcode ?? barcode,
        query: overrides.albumQuery ?? albumQuery,
        artist: overrides.artistQuery ?? artistQuery,
        releaseId: overrides.releaseIdQuery ?? releaseIdQuery,
      });

      setResults(nextResults);
      setStatus("success");

      if (!nextResults.length) {
        setError("No matching release was found. Try another barcode, title, artist, or release ID.");
      }
    } catch (nextError) {
      setResults([]);
      setStatus("error");
      setError(nextError instanceof Error ? nextError.message : "Search failed.");
    }
  }

  async function handleBarcodeImage(event) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setScanMessage("");

    if (typeof BarcodeDetector === "undefined") {
      setScanMessage("Barcode scanning is not supported in this browser. Enter the barcode manually instead.");
      return;
    }

    try {
      const imageBitmap = await createImageBitmap(file);
      const detector = new BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128"] });
      const detections = await detector.detect(imageBitmap);
      const detectedCode = detections[0]?.rawValue || "";

      if (!detectedCode) {
        setScanMessage("No barcode detected in that image. Try a clearer photo or enter the number manually.");
        return;
      }

      setBarcode(detectedCode);
      setScanMessage(`Barcode detected: ${detectedCode}`);
      await runSearch({ barcode: detectedCode });
    } catch (nextError) {
      setScanMessage(nextError instanceof Error ? nextError.message : "Barcode scan failed.");
    } finally {
      event.target.value = "";
    }
  }

  function handleAdd(candidate) {
    onAddRecord?.(candidate);
    setSuccessMessage(`Added ${candidate.Title} by ${candidate.Artist} to your collection.`);
  }

  return (
    <section className="add-music-page" aria-label="Add new music to collection">
      <article className="glass-panel add-music-page__panel">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Build The Collection</p>
          <h2 className="section-heading__title">➕ Add New Music</h2>
        </div>

        <p className="add-music-page__copy">
          Scan a barcode photo or search by album title, artist, or Discogs release number, then add it to your collection.
        </p>

        <div className="add-music-page__form-grid">
          <label className="add-music-page__field">
            <span>Barcode</span>
            <input value={barcode} onChange={(event) => setBarcode(event.target.value)} placeholder="e.g. 602557567517" />
          </label>

          <label className="add-music-page__field">
            <span>Album Title</span>
            <input value={albumQuery} onChange={(event) => setAlbumQuery(event.target.value)} placeholder="e.g. 21" />
          </label>

          <label className="add-music-page__field">
            <span>Artist</span>
            <input value={artistQuery} onChange={(event) => setArtistQuery(event.target.value)} placeholder="e.g. Adele" />
          </label>

          <label className="add-music-page__field">
            <span>Discogs Release ID</span>
            <input value={releaseIdQuery} onChange={(event) => setReleaseIdQuery(event.target.value)} placeholder="e.g. 14987088" />
          </label>
        </div>

        <div className="add-music-page__actions">
          <button type="button" className="collection-button" onClick={() => runSearch()} disabled={status === "loading"}>
            {status === "loading" ? "Searching..." : "Search"}
          </button>

          <label className="add-music-page__scan-button">
            <input type="file" accept="image/*" capture="environment" onChange={handleBarcodeImage} />
            Scan Barcode Photo
          </label>
        </div>

        {scanMessage ? <p className="status-message">{scanMessage}</p> : null}
        {error ? <p className="status-message">{error}</p> : null}
        {successMessage ? <p className="status-message">{successMessage}</p> : null}

        {results.length ? (
          <ul className="add-music-page__results">
            {results.map((candidate) => (
              <li key={`${candidate.release_id}-${candidate.Title}`} className="glass-panel add-music-page__result-card">
                <div className="add-music-page__result-art">
                  {candidate.thumb ? (
                    <img src={candidate.thumb} alt={candidate.Title} className="add-music-page__result-image" />
                  ) : (
                    <div className="artwork-state artwork-state--placeholder" aria-label="No artwork available">
                      <span className="artwork-state__monogram">M&amp;M</span>
                      <span className="artwork-state__label">Music &amp; Memories</span>
                    </div>
                  )}
                </div>

                <div className="add-music-page__result-body">
                  <p className="add-music-page__result-artist">{candidate.Artist}</p>
                  <h3 className="add-music-page__result-title">{candidate.Title}</h3>
                  <p className="add-music-page__result-meta">{candidate.Released} {candidate.Label ? `• ${candidate.Label}` : ""}</p>
                  <p className="add-music-page__result-meta">Release ID: {candidate.release_id}</p>
                  <button type="button" className="collection-button" onClick={() => handleAdd(candidate)}>
                    Add To Collection
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : status === "success" ? (
          <p className="empty-state">No matching releases yet.</p>
        ) : null}
      </article>
    </section>
  );
}

export default AddMusicPage;