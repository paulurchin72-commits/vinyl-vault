import { useEffect, useState } from "react";
import { getArtworkUrl } from "./artworkService";

export function useArtwork(releaseId, fallbackContext = null) {
  const [artworkUrl, setArtworkUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadArtwork() {
      console.log("useArtwork releaseId:", releaseId);

      if (releaseId === null || releaseId === undefined || releaseId === "") {
        setArtworkUrl(null);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const nextArtworkUrl = await getArtworkUrl(releaseId, fallbackContext);
        console.log("getArtworkUrl returned:", nextArtworkUrl);

        if (!isCancelled) {
          setArtworkUrl(nextArtworkUrl);
        }
      } catch (nextError) {
        console.log("Artwork error:", nextError);

        if (!isCancelled) {
          setArtworkUrl(null);
          setError(nextError instanceof Error ? nextError : new Error("Failed to load artwork."));
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadArtwork();

    return () => {
      isCancelled = true;
    };
  }, [fallbackContext?.artist, fallbackContext?.title, fallbackContext?.year, releaseId]);

  return {
    artworkUrl,
    loading,
    error,
  };
}
