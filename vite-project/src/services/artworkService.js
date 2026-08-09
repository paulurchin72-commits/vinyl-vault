import { getRelease } from "./discogs";

const artworkUrlByReleaseId = new Map();
const largeArtworkUrlByReleaseId = new Map();

function normalizeReleaseId(releaseId) {
  if (releaseId === null || releaseId === undefined || releaseId === "") {
    throw new Error("A valid Discogs releaseId is required.");
  }

  return String(releaseId);
}

export async function getArtworkUrl(releaseId, fallbackContext = null, options = {}) {
  const normalizedReleaseId = normalizeReleaseId(releaseId);
  const preferLarge = Boolean(options.preferLarge);

  const targetCache = preferLarge ? largeArtworkUrlByReleaseId : artworkUrlByReleaseId;

  if (targetCache.has(normalizedReleaseId)) {
    return targetCache.get(normalizedReleaseId);
  }

  const releaseData = await getRelease(normalizedReleaseId, fallbackContext);
  const artworkUrl = preferLarge
    ? releaseData?.image || releaseData?.thumb || null
    : releaseData?.thumb || releaseData?.image || null;

  artworkUrlByReleaseId.set(normalizedReleaseId, artworkUrl);
  largeArtworkUrlByReleaseId.set(normalizedReleaseId, releaseData?.image || releaseData?.thumb || null);

  return artworkUrl;
}
