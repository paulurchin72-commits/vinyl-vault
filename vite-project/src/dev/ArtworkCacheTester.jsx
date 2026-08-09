import { useEffect, useState } from "react";
import {
  clearCache,
  deleteArtwork,
  getArtwork,
  getCacheStats,
  hasArtwork,
  saveArtwork,
} from "../services/artworkCache";

const SAMPLE_RELEASE_ID = "dev-sample-release-001";

function createSampleArtworkBlob() {
  const svg = [
    "<svg xmlns='http://www.w3.org/2000/svg' width='320' height='320' viewBox='0 0 320 320'>",
    "<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#173753'/><stop offset='100%' stop-color='#6daedb'/></linearGradient></defs>",
    "<rect width='320' height='320' fill='url(#g)'/>",
    "<circle cx='160' cy='160' r='86' fill='rgba(255,255,255,0.18)'/>",
    "<circle cx='160' cy='160' r='18' fill='rgba(255,255,255,0.82)'/>",
    "<text x='160' y='288' text-anchor='middle' fill='white' font-family='Arial, sans-serif' font-size='20'>Artwork Cache Test</text>",
    "</svg>",
  ].join("");

  return new Blob([svg], { type: "image/svg+xml" });
}

function formatBytes(byteCount) {
  const value = Number(byteCount || 0);

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(2)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function ArtworkCacheTester() {
  const [imageUrl, setImageUrl] = useState(null);
  const [stats, setStats] = useState({ count: 0, totalBytes: 0 });
  const [existsAfterDelete, setExistsAfterDelete] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [logLines, setLogLines] = useState([]);

  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  function appendLog(message) {
    setLogLines((current) => [...current, message]);
  }

  async function refreshStats() {
    const nextStats = await getCacheStats();
    setStats(nextStats);
    return nextStats;
  }

  async function runValidation() {
    setRunning(true);
    setError("");
    setLogLines([]);
    setExistsAfterDelete(null);

    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
      setImageUrl(null);
    }

    try {
      appendLog("1) Creating sample image blob.");
      const sampleBlob = createSampleArtworkBlob();

      appendLog("2) Saving sample blob into artworkCache.");
      await saveArtwork(SAMPLE_RELEASE_ID, sampleBlob);

      appendLog("3) Verifying saved record exists.");
      const existsAfterSave = await hasArtwork(SAMPLE_RELEASE_ID);
      appendLog(`   existsAfterSave: ${existsAfterSave}`);

      appendLog("4) Reading image back from cache.");
      const cachedBlob = await getArtwork(SAMPLE_RELEASE_ID);
      if (!cachedBlob) {
        throw new Error("No blob returned from getArtwork after save.");
      }

      const objectUrl = URL.createObjectURL(cachedBlob);
      setImageUrl(objectUrl);
      appendLog("   Retrieved image converted to object URL and displayed.");

      appendLog("5) Reading cache statistics.");
      const currentStats = await refreshStats();
      appendLog(`   count=${currentStats.count}, totalBytes=${currentStats.totalBytes}`);

      appendLog("6) Deleting image from cache.");
      await deleteArtwork(SAMPLE_RELEASE_ID);

      appendLog("7) Verifying image no longer exists.");
      const existsNow = await hasArtwork(SAMPLE_RELEASE_ID);
      setExistsAfterDelete(existsNow);
      appendLog(`   existsAfterDelete: ${existsNow}`);

      appendLog("8) Refreshing cache statistics after delete.");
      const finalStats = await refreshStats();
      appendLog(`   count=${finalStats.count}, totalBytes=${finalStats.totalBytes}`);
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Validation failed.");
    } finally {
      setRunning(false);
    }
  }

  async function handleClearCache() {
    setError("");

    try {
      await clearCache();
      await refreshStats();
      appendLog("Cache cleared using clearCache().");
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : "Failed to clear cache.");
    }
  }

  return (
    <section aria-label="Artwork cache developer tester" style={{ padding: "1rem", maxWidth: 700 }}>
      <h2>Artwork Cache Tester</h2>
      <p>
        Standalone validation utility for save, read, display, stats, delete, and existence checks.
      </p>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem" }}>
        <button type="button" onClick={runValidation} disabled={running}>
          {running ? "Running..." : "Run Validation"}
        </button>

        <button type="button" onClick={handleClearCache} disabled={running}>
          Clear Cache
        </button>
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <p>
          <strong>Sample release_id:</strong> {SAMPLE_RELEASE_ID}
        </p>
        <p>
          <strong>Cache count:</strong> {stats.count}
        </p>
        <p>
          <strong>Total size:</strong> {formatBytes(stats.totalBytes)}
        </p>
        <p>
          <strong>Exists after delete:</strong>{" "}
          {existsAfterDelete === null ? "Not checked yet" : String(existsAfterDelete)}
        </p>
      </div>

      {imageUrl ? (
        <div style={{ marginBottom: "1rem" }}>
          <p>
            <strong>Retrieved image preview:</strong>
          </p>
          <img
            src={imageUrl}
            alt="Retrieved from artwork cache"
            width={240}
            height={240}
            style={{ border: "1px solid #ccc", display: "block" }}
          />
        </div>
      ) : null}

      {error ? (
        <p role="alert" style={{ color: "#b42318" }}>
          Error: {error}
        </p>
      ) : null}

      <div>
        <p>
          <strong>Validation log:</strong>
        </p>
        <pre
          style={{
            margin: 0,
            padding: "0.75rem",
            background: "#f6f8fa",
            border: "1px solid #d0d7de",
            borderRadius: 6,
            whiteSpace: "pre-wrap",
          }}
        >
          {logLines.length ? logLines.join("\n") : "No validation run yet."}
        </pre>
      </div>
    </section>
  );
}

export default ArtworkCacheTester;