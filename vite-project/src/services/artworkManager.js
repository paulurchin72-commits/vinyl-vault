import { getArtwork } from "./artworkCache";
import { syncArtworkBatch } from "./artworkSync";

function getAlbumKey(album) {
  return album.albumKey || album.release_id || `${album.Artist}-${album.Title}-${album.Released}`;
}

function createDefaultEntry() {
  return {
    status: "idle",
    coverUrl: null,
    releaseData: null,
    error: null,
  };
}

function createArtworkManager() {
  const albumCache = new Map();
  const releaseCache = new Map();
  const objectUrlCache = new Map();
  const maxObjectUrls = 180;
  const syncQueue = [];
  const maxConcurrentSyncs = 1;
  let activeSyncs = 0;

  function touchObjectUrl(releaseId, objectUrl) {
    if (objectUrlCache.has(releaseId)) {
      objectUrlCache.delete(releaseId);
    }

    objectUrlCache.set(releaseId, objectUrl);

    while (objectUrlCache.size > maxObjectUrls) {
      const oldestEntry = objectUrlCache.entries().next().value;
      if (!oldestEntry) {
        break;
      }

      const [oldestReleaseId, oldestObjectUrl] = oldestEntry;
      objectUrlCache.delete(oldestReleaseId);

      if (typeof URL !== "undefined" && oldestObjectUrl) {
        URL.revokeObjectURL(oldestObjectUrl);
      }
    }
  }

  function queueSyncTask(task) {
    return new Promise((resolve, reject) => {
      syncQueue.push({ task, resolve, reject });
      flushSyncQueue();
    });
  }

  function flushSyncQueue() {
    while (activeSyncs < maxConcurrentSyncs && syncQueue.length) {
      const nextTask = syncQueue.shift();
      activeSyncs += 1;

      Promise.resolve()
        .then(nextTask.task)
        .then(nextTask.resolve, nextTask.reject)
        .finally(() => {
          activeSyncs -= 1;
          flushSyncQueue();
        });
    }
  }

  async function getCachedArtworkUrl(releaseId) {
    if (objectUrlCache.has(releaseId)) {
      const cachedObjectUrl = objectUrlCache.get(releaseId);
      touchObjectUrl(releaseId, cachedObjectUrl);
      return cachedObjectUrl;
    }

    const blob = await getArtwork(releaseId).catch(() => null);
    if (!blob) {
      return null;
    }

    const objectUrl = URL.createObjectURL(blob);
    touchObjectUrl(releaseId, objectUrl);
    return objectUrl;
  }

  async function syncReleaseArtwork(releaseId) {
    return queueSyncTask(async () => {
      const progress = await syncArtworkBatch([{ release_id: releaseId }]);
      const artworkUrl = await getCachedArtworkUrl(releaseId);

      return {
        artworkUrl,
        result: progress.results[0] || null,
      };
    });
  }

  function getSnapshot() {
    return Object.fromEntries(albumCache.entries());
  }

  function getEntry(albumKey) {
    return albumCache.get(albumKey) || createDefaultEntry();
  }

  function setAlbumEntry(albumKey, entry) {
    albumCache.set(albumKey, entry);
    return entry;
  }

  function buildFinalEntry(releaseData) {
    return {
      status: releaseData?.thumb ? "loaded" : "missing",
      coverUrl: releaseData?.thumb || null,
      releaseData: releaseData || null,
      error: null,
    };
  }

  function ensureAlbumArtwork(album, fetchRelease) {
    const albumKey = getAlbumKey(album);
    const currentEntry = getEntry(albumKey);

    if (currentEntry.status === "loaded" || currentEntry.status === "missing") {
      return Promise.resolve(currentEntry);
    }

    const releaseId = album.release_id ? String(album.release_id).trim() : "";

    if (!releaseId) {
      return Promise.resolve(
        setAlbumEntry(albumKey, {
          ...currentEntry,
          status: "missing",
          coverUrl: null,
          error: null,
        })
      );
    }

    const cachedRelease = releaseCache.get(releaseId);

    if (cachedRelease) {
      if (cachedRelease.status === "loading") {
        setAlbumEntry(albumKey, {
          ...currentEntry,
          status: "loading",
          error: null,
        });

        return cachedRelease.promise.then((entry) => setAlbumEntry(albumKey, entry));
      }

      return Promise.resolve(setAlbumEntry(albumKey, cachedRelease.entry));
    }

    setAlbumEntry(albumKey, {
      ...currentEntry,
      status: "loading",
      error: null,
    });

    const request = getCachedArtworkUrl(releaseId)
      .then(async (cachedArtworkUrl) => {
        if (cachedArtworkUrl) {
          const entry = buildFinalEntry({ thumb: cachedArtworkUrl });
          releaseCache.set(releaseId, {
            status: "ready",
            entry,
          });
          return setAlbumEntry(albumKey, entry);
        }

        const syncOutcome = await syncReleaseArtwork(releaseId);
        if (syncOutcome.artworkUrl) {
          const entry = buildFinalEntry({ thumb: syncOutcome.artworkUrl });
          releaseCache.set(releaseId, {
            status: "ready",
            entry,
          });
          return setAlbumEntry(albumKey, entry);
        }

        if (syncOutcome.result?.status === "unavailable") {
          const entry = buildFinalEntry(null);
          releaseCache.set(releaseId, {
            status: "ready",
            entry,
          });
          return setAlbumEntry(albumKey, entry);
        }

        // Fall back to direct release metadata only if cache fill did not resolve the artwork.
        return fetchRelease(releaseId, {
          artist: album.Artist,
          title: album.Title,
          year: album.Released,
        }).then((releaseData) => {
          const entry = buildFinalEntry(releaseData);
          releaseCache.set(releaseId, {
            status: "ready",
            entry,
          });
          return setAlbumEntry(albumKey, entry);
        });
      })
      .catch((error) => {
        const entry = {
          status: "idle",
          coverUrl: null,
          releaseData: null,
          error: error instanceof Error ? error.message : "Artwork unavailable",
        };

        releaseCache.delete(releaseId);

        return setAlbumEntry(albumKey, entry);
      });

    releaseCache.set(releaseId, {
      status: "loading",
      promise: request,
    });

    return request;
  }

  return {
    getSnapshot,
    getEntry,
    ensureAlbumArtwork,
  };
}

const artworkManager = createArtworkManager();

export default artworkManager;