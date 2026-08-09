import { getRelease } from "../services/discogs";

const artworkUrlByReleaseId = new Map();
const inFlightArtworkByReleaseId = new Map();
const requestQueue = [];
const MAX_CONCURRENT_REQUESTS = 8;
const ARTWORK_URL_CACHE_PREFIX = "artwork-v2:url:";
let activeRequests = 0;

function runWithQueue(task) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ task, resolve, reject });
    flushQueue();
  });
}

function flushQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && requestQueue.length) {
    const next = requestQueue.shift();
    activeRequests += 1;

    Promise.resolve()
      .then(next.task)
      .then(next.resolve, next.reject)
      .finally(() => {
        activeRequests -= 1;
        flushQueue();
      });
  }
}

function normalizeReleaseId(releaseId) {
  if (releaseId === null || releaseId === undefined || releaseId === "") {
    return null;
  }

  const normalizedReleaseId = String(releaseId).trim();
  return normalizedReleaseId || null;
}

function getCachedArtworkUrl(normalizedReleaseId) {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const cacheKey = `${ARTWORK_URL_CACHE_PREFIX}${normalizedReleaseId}`;
    const cachedValue = localStorage.getItem(cacheKey);
    return cachedValue || null;
  } catch {
    return null;
  }
}

function setCachedArtworkUrl(normalizedReleaseId, artworkUrl) {
  if (!artworkUrl || typeof localStorage === "undefined") {
    return;
  }

  try {
    const cacheKey = `${ARTWORK_URL_CACHE_PREFIX}${normalizedReleaseId}`;
    localStorage.setItem(cacheKey, artworkUrl);
  } catch {
    // Ignore storage limits/errors and keep in-memory cache.
  }
}

export async function getArtworkUrl(releaseId, fallbackContext = null) {
  const normalizedReleaseId = normalizeReleaseId(releaseId);

  if (!normalizedReleaseId) {
    return null;
  }

  if (artworkUrlByReleaseId.has(normalizedReleaseId)) {
    return artworkUrlByReleaseId.get(normalizedReleaseId);
  }

  const localCachedUrl = getCachedArtworkUrl(normalizedReleaseId);
  if (localCachedUrl) {
    artworkUrlByReleaseId.set(normalizedReleaseId, localCachedUrl);
    return localCachedUrl;
  }

  if (inFlightArtworkByReleaseId.has(normalizedReleaseId)) {
    return inFlightArtworkByReleaseId.get(normalizedReleaseId);
  }

  const request = runWithQueue(() => getRelease(normalizedReleaseId, fallbackContext))
    .then((releaseData) => {
      const artworkUrl = releaseData?.thumb || null;
      artworkUrlByReleaseId.set(normalizedReleaseId, artworkUrl);
      setCachedArtworkUrl(normalizedReleaseId, artworkUrl);
      return artworkUrl;
    })
    .finally(() => {
      inFlightArtworkByReleaseId.delete(normalizedReleaseId);
    });

  inFlightArtworkByReleaseId.set(normalizedReleaseId, request);
  return request;
}
