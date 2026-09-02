import { useEffect, useState } from "react";
import { getArtworkUrl, peekArtworkUrl } from "./artworkService";

export function useArtwork(releaseId, fallbackContext = null) {
  const [artworkUrl, setArtworkUrl] = useState(() => peekArtworkUrl(releaseId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadArtwork() {
      if (releaseId === null || releaseId === undefined || releaseId === "") {
        setArtworkUrl(null);
        setLoading(false);
        setError(null);
        return;
      }

      const cachedArtworkUrl = peekArtworkUrl(releaseId);
      if (cachedArtworkUrl) {
        if (!isCancelled) {
          setArtworkUrl(cachedArtworkUrl);
          setLoading(false);
          setError(null);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const nextArtworkUrl = await getArtworkUrl(releaseId, fallbackContext);

        if (!isCancelled) {
          setArtworkUrl(nextArtworkUrl);
        }
      } catch (nextError) {
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
