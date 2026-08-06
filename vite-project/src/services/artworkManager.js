function createArtworkStorageAdapter() {
  return {
    loadSnapshot() {
      return {};
    },
    saveEntry() {
      // Reserved for future localStorage-backed artwork persistence.
    },
  };
}

function getTraceStore() {
  if (typeof globalThis === "undefined") {
    return null;
  }

  return globalThis;
}

function logTrace(stage, payload) {
  const traceStore = getTraceStore();
  if (!traceStore?.__MM_TRACE_FIRST_ALBUM__) {
    return;
  }

  console.log(`[MM TRACE] ${stage}`, payload);
}

function isTracedAlbumKey(traceStore, albumKey) {
  return (
    traceStore?.__MM_TRACE_FIRST_ALBUM__?.albumKey === albumKey ||
    traceStore?.__MM_TRACE_SUCCESS_ALBUM__?.albumKey === albumKey
  );
}

function createArtworkManager(storage = createArtworkStorageAdapter()) {
  const cache = new Map(Object.entries(storage.loadSnapshot()));
  const inflightRequests = new Map();
  const queuedAlbums = new Set();
  const queue = [];
  const listeners = new Set();
  const maxConcurrentRequests = 2;
  let activeRequests = 0;

  function createDefaultEntry() {
    return {
      status: "idle",
      coverUrl: null,
      releaseData: null,
      error: null,
    };
  }

  function notify() {
    const snapshot = Object.fromEntries(cache.entries());
    listeners.forEach((listener) => listener(snapshot));
  }

  function getEntry(albumKey) {
    const entry = cache.get(albumKey) || createDefaultEntry();
    const traceStore = getTraceStore();

    if (isTracedAlbumKey(traceStore, albumKey)) {
      const snapshotKey = `${entry.status}|${entry.coverUrl || ""}`;
      traceStore.__MM_TRACE_LAST_GET_ENTRY__ ||= {};

      if (traceStore.__MM_TRACE_LAST_GET_ENTRY__[albumKey] !== snapshotKey) {
        traceStore.__MM_TRACE_LAST_GET_ENTRY__[albumKey] = snapshotKey;
        logTrace("4b.getEntry()", {
          albumKey,
          entry,
        });
      }
    }

    return entry;
  }

  function setEntry(albumKey, nextEntry) {
    const traceStore = getTraceStore();
    if (traceStore && !traceStore.__MM_TRACE_SUCCESS_ALBUM__ && nextEntry.status === "loaded" && nextEntry.coverUrl) {
      traceStore.__MM_TRACE_SUCCESS_ALBUM__ = {
        albumKey,
        coverUrl: nextEntry.coverUrl,
      };

      logTrace("4a.traceTargetSelected", traceStore.__MM_TRACE_SUCCESS_ALBUM__);
    }

    if (isTracedAlbumKey(traceStore, albumKey)) {
      logTrace("4.setEntry()", {
        albumKey,
        nextEntry,
      });
    }

    cache.set(albumKey, nextEntry);
    storage.saveEntry(albumKey, nextEntry);
    notify();
    return nextEntry;
  }

  function mergeReleaseData(entry, releaseData) {
    return {
      status: releaseData.thumb ? "loaded" : "missing",
      coverUrl: releaseData.thumb || null,
      releaseData,
      error: null,
      fetchedAt: Date.now(),
    };
  }

  async function ensureAlbumArtwork(album, fetchRelease) {
    const albumKey = album.albumKey || album.release_id || `${album.Artist}-${album.Title}-${album.Released}`;
    const currentEntry = getEntry(albumKey);

    if (["loaded", "missing"].includes(currentEntry.status)) {
      return currentEntry;
    }

    if (inflightRequests.has(albumKey)) {
      return inflightRequests.get(albumKey);
    }

    if (!album.release_id) {
      return setEntry(albumKey, {
        ...currentEntry,
        status: "missing",
        coverUrl: null,
        error: null,
      });
    }

    setEntry(albumKey, {
      ...currentEntry,
      status: "loading",
      error: null,
    });

    const request = fetchRelease(album.release_id)
      .then((releaseData) => setEntry(albumKey, mergeReleaseData(currentEntry, releaseData)))
      .catch((error) =>
        setEntry(albumKey, {
          ...currentEntry,
          status: "missing",
          coverUrl: null,
          error: error instanceof Error ? error.message : "Artwork unavailable",
        })
      )
      .finally(() => {
        inflightRequests.delete(albumKey);
      });

    inflightRequests.set(albumKey, request);

    return request;
  }

  function processQueue() {
    while (activeRequests < maxConcurrentRequests && queue.length > 0) {
      const nextJob = queue.shift();
      const albumKey = nextJob.album.albumKey || nextJob.album.release_id || `${nextJob.album.Artist}-${nextJob.album.Title}-${nextJob.album.Released}`;

      queuedAlbums.delete(albumKey);

      if (["loaded", "missing", "loading"].includes(getEntry(albumKey).status)) {
        continue;
      }

      activeRequests += 1;

      Promise.resolve(ensureAlbumArtwork(nextJob.album, nextJob.fetchRelease)).finally(() => {
        activeRequests -= 1;
        window.setTimeout(processQueue, 0);
      });
    }
  }

  function queueArtwork(albums, fetchRelease, priority = "background") {
    albums.forEach((album) => {
      const albumKey = album.albumKey || album.release_id || `${album.Artist}-${album.Title}-${album.Released}`;

      if (!albumKey || queuedAlbums.has(albumKey)) {
        return;
      }

      if (["loaded", "missing", "loading"].includes(getEntry(albumKey).status)) {
        return;
      }

      queuedAlbums.add(albumKey);

      if (priority === "priority") {
        queue.unshift({ album, fetchRelease });
      } else {
        queue.push({ album, fetchRelease });
      }
    });

    window.setTimeout(processQueue, 0);
  }

  return {
    getSnapshot() {
      return Object.fromEntries(cache.entries());
    },
    getEntry,
    subscribe(listener) {
      listeners.add(listener);
      listener(Object.fromEntries(cache.entries()));

      return () => {
        listeners.delete(listener);
      };
    },
    ensureAlbumArtwork,
    queueArtwork,
  };
}

const artworkManager = createArtworkManager();

export default artworkManager;