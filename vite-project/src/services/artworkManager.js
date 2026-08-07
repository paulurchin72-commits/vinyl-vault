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

    const releaseId = album.release_id ? String(album.release_id) : "";

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

    const request = fetchRelease(releaseId)
      .then((releaseData) => {
        const entry = buildFinalEntry(releaseData);
          releaseCache.set(releaseId, {
          status: "ready",
          entry,
        });
        return setAlbumEntry(albumKey, entry);
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