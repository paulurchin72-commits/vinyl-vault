const TRACK_INDEX_KEY = "the-memory-box:local-track-index";

function normalizeReleaseId(value) {
  return String(value || "").trim();
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\bthe\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeTrackIndexEntries(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const releaseId = normalizeReleaseId(entry.release_id || entry.releaseId);
      const artist = String(entry.artist || entry.Artist || "").trim();
      const album = String(entry.album || entry.title || entry.Title || "").trim();
      const tracks = Array.isArray(entry.tracks)
        ? entry.tracks
          .map((track) => String(track?.title || track?.name || track || "").trim())
          .filter(Boolean)
        : [];

      if (!releaseId || !artist || !album) {
        return null;
      }

      return {
        release_id: releaseId,
        artist,
        album,
        year: entry.year || entry.Released || "",
        tracks,
        updatedAt: entry.updatedAt || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

export function loadLocalTrackIndex() {
  try {
    return normalizeTrackIndexEntries(JSON.parse(localStorage.getItem(TRACK_INDEX_KEY) || "[]"));
  } catch {
    return [];
  }
}

export function saveLocalTrackIndex(entries) {
  const normalizedEntries = normalizeTrackIndexEntries(entries);

  try {
    localStorage.setItem(TRACK_INDEX_KEY, JSON.stringify(normalizedEntries));
  } catch {
    // Keep the in-memory index even if this device cannot persist it.
  }

  return normalizedEntries;
}

export function upsertTrackIndexEntry(entries, record, tracks) {
  const releaseId = normalizeReleaseId(record?.release_id || record?.releaseId || record?.["Release ID"]);
  if (!releaseId) {
    return entries;
  }

  const trackTitles = Array.isArray(tracks)
    ? tracks
      .map((track) => String(track?.title || track?.name || track || "").trim())
      .filter(Boolean)
    : [];

  if (!trackTitles.length) {
    return entries;
  }

  const nextEntry = {
    release_id: releaseId,
    artist: record.Artist || record.artist || "Unknown Artist",
    album: record.Title || record.title || "Unknown Album",
    year: record.Released || record.year || "",
    tracks: trackTitles,
    updatedAt: new Date().toISOString(),
  };
  const nextEntries = normalizeTrackIndexEntries(entries).filter((entry) => entry.release_id !== releaseId);

  return saveLocalTrackIndex([nextEntry, ...nextEntries]);
}

export function mergeTrackIndexes(baseEntries, localEntries) {
  const entriesByReleaseId = new Map();

  normalizeTrackIndexEntries(baseEntries).forEach((entry) => {
    entriesByReleaseId.set(entry.release_id, entry);
  });

  normalizeTrackIndexEntries(localEntries).forEach((entry) => {
    entriesByReleaseId.set(entry.release_id, entry);
  });

  return Array.from(entriesByReleaseId.values());
}

export function getTrackIndexLookup(entries) {
  const byReleaseId = new Map();
  const byArtistAlbum = new Map();

  normalizeTrackIndexEntries(entries).forEach((entry) => {
    byReleaseId.set(entry.release_id, entry);
    byArtistAlbum.set(`${normalizeText(entry.artist)}|||${normalizeText(entry.album)}`, entry);
  });

  return {
    byReleaseId,
    byArtistAlbum,
  };
}

export function getTrackIndexKey() {
  return TRACK_INDEX_KEY;
}
