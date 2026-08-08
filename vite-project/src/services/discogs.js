const TOKEN = import.meta.env.VITE_DISCOGS_TOKEN;
const MAX_RELEASE_RETRIES = 4;
const RELEASE_REQUEST_TIMEOUT_MS = 10000;
const MAX_PRELOADED_IMAGES = 240;
const RELEASE_CACHE_PREFIX = "release-details:";

const releaseDataById = new Map();
const inFlightReleaseById = new Map();
const releaseTrackSearchById = new Map();
const preloadedImagesByUrl = new Map();
let discogsCooldownUntil = 0;

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function normalizeReleaseId(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return String(value).trim();
}

function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function getPersistentReleaseDetails(releaseId) {
  if (typeof localStorage === "undefined") {
    return null;
  }

  try {
    const storedValue = localStorage.getItem(`${RELEASE_CACHE_PREFIX}${releaseId}`);
    if (!storedValue) {
      return null;
    }

    const parsedValue = JSON.parse(storedValue);
    if (!parsedValue || typeof parsedValue !== "object") {
      return null;
    }

    return {
      title: parsedValue.title || "",
      year: parsedValue.year || "",
      thumb: parsedValue.thumb || null,
      image: parsedValue.image || parsedValue.thumb || null,
      rearImage: parsedValue.rearImage || null,
      label: parsedValue.label || "",
      genres: parsedValue.genres || "",
    };
  } catch {
    return null;
  }
}

function setPersistentReleaseDetails(releaseId, releaseDetails) {
  if (typeof localStorage === "undefined" || !releaseDetails?.thumb) {
    return;
  }

  try {
    localStorage.setItem(
      `${RELEASE_CACHE_PREFIX}${releaseId}`,
      JSON.stringify({
        title: releaseDetails.title || "",
        year: releaseDetails.year || "",
        thumb: releaseDetails.thumb || null,
        image: releaseDetails.image || releaseDetails.thumb || null,
        rearImage: releaseDetails.rearImage || null,
        label: releaseDetails.label || "",
        genres: releaseDetails.genres || "",
      })
    );
  } catch {
    // Ignore storage quota issues and continue with in-memory cache only.
  }
}

function buildItunesFallbackResult(fallbackArtworkUrl, fallbackContext) {
  return {
    title: fallbackContext?.title || "",
    year: fallbackContext?.year || "",
    thumb: fallbackArtworkUrl,
    image: fallbackArtworkUrl,
    rearImage: null,
    label: "",
    genres: "",
  };
}

async function searchItunesArtwork(fallbackContext) {
  const artist = String(fallbackContext?.artist || "").trim();
  const title = String(fallbackContext?.title || "").trim();

  if (!artist || !title) {
    return null;
  }

  const term = encodeURIComponent(`${artist} ${title}`);
  const response = await fetch(`https://itunes.apple.com/search?media=music&entity=album&limit=10&term=${term}`);

  if (!response.ok) {
    return null;
  }

  const data = await response.json().catch(() => null);
  const results = Array.isArray(data?.results) ? data.results : [];
  const normalizedArtist = normalizeSearchText(artist);
  const normalizedTitle = normalizeSearchText(title);

  const matchingResult = results.find((result) => {
    const resultArtist = normalizeSearchText(result?.artistName);
    const resultCollection = normalizeSearchText(result?.collectionName || result?.trackName);

    return resultArtist.includes(normalizedArtist) && resultCollection.includes(normalizedTitle);
  }) || results[0];

  return matchingResult?.artworkUrl100 || null;
}

async function searchMusicBrainzArtwork(fallbackContext) {
  const artist = String(fallbackContext?.artist || "").trim();
  const title = String(fallbackContext?.title || "").trim();

  if (!artist || !title) {
    return null;
  }

  const query = encodeURIComponent(`artist:"${artist}" AND release:"${title}"`);
  const searchResponse = await fetch(
    `https://musicbrainz.org/ws/2/release/?query=${query}&fmt=json&limit=10`,
    {
      headers: {
        "User-Agent": "MusicAndMemories/1.0",
      },
    }
  ).catch(() => null);

  if (!searchResponse?.ok) {
    return null;
  }

  const searchData = await searchResponse.json().catch(() => null);
  const releases = Array.isArray(searchData?.releases) ? searchData.releases : [];
  const normalizedArtist = normalizeSearchText(artist);
  const normalizedTitle = normalizeSearchText(title);

  const matchedRelease = releases.find((release) => {
    const releaseTitle = normalizeSearchText(release?.title);
    const releaseArtists = Array.isArray(release?.["artist-credit"])
      ? release["artist-credit"].map((entry) => normalizeSearchText(entry?.name)).join(" ")
      : "";

    return releaseTitle.includes(normalizedTitle) && releaseArtists.includes(normalizedArtist);
  }) || releases[0];

  if (!matchedRelease?.id) {
    return null;
  }

  const coverResponse = await fetch(`https://coverartarchive.org/release/${matchedRelease.id}`).catch(() => null);

  if (!coverResponse?.ok) {
    return null;
  }

  const coverData = await coverResponse.json().catch(() => null);
  const firstImage = Array.isArray(coverData?.images) ? coverData.images[0] : null;

  return firstImage?.thumbnails?.small || firstImage?.thumbnails?.large || firstImage?.image || null;
}

async function resolveFallbackArtworkUrl(fallbackContext) {
  const itunesArtworkUrl = await searchItunesArtwork(fallbackContext);
  if (itunesArtworkUrl) {
    return itunesArtworkUrl;
  }

  return searchMusicBrainzArtwork(fallbackContext);
}

function preloadArtworkImage(url) {
  if (!url || typeof Image === "undefined") {
    return;
  }

  if (preloadedImagesByUrl.has(url)) {
    const cachedImage = preloadedImagesByUrl.get(url);
    preloadedImagesByUrl.delete(url);
    preloadedImagesByUrl.set(url, cachedImage);
    return;
  }

  const image = new Image();
  image.decoding = "async";
  image.loading = "eager";
  image.src = url;
  preloadedImagesByUrl.set(url, image);

  if (preloadedImagesByUrl.size > MAX_PRELOADED_IMAGES) {
    const oldestUrl = preloadedImagesByUrl.keys().next().value;
    if (oldestUrl) {
      preloadedImagesByUrl.delete(oldestUrl);
    }
  }
}

function createDiscogsError(status, bodyText) {
  const error = new Error(`Discogs API error: ${status}`);
  error.status = status;
  error.bodyText = bodyText;
  return error;
}

function parseRetryAfterMs(response) {
  const retryAfterHeader = response.headers.get("Retry-After");

  if (!retryAfterHeader) {
    return null;
  }

  const seconds = Number(retryAfterHeader);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return Math.ceil(seconds * 1000);
}

async function requestDiscogsJson(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, RELEASE_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Discogs token=${TOKEN}`,
        "User-Agent": "MusicAndMemories/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw createDiscogsError(response.status, await response.text().catch(() => ""));
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildSearchCandidate(result) {
  const titleParts = String(result?.title || "").split(" - ");
  const artist = result?.artist || titleParts[0] || "Unknown Artist";
  const title = result?.title && titleParts.length > 1 ? titleParts.slice(1).join(" - ") : result?.title || "Unknown Album";

  return {
    release_id: normalizeReleaseId(result?.id),
    Artist: artist,
    Title: title,
    Released: result?.year || "Unknown",
    Label: Array.isArray(result?.label) ? result.label[0] || "" : result?.label || "",
    thumb: result?.thumb || result?.cover_image || null,
    cover: result?.cover_image || result?.thumb || null,
    genres: Array.isArray(result?.genre) ? result.genre.join(", ") : result?.genre || "",
    format: Array.isArray(result?.format) ? result.format.join(", ") : result?.format || "",
  };
}

function normalizeTrackSearchText(value) {
  return normalizeSearchText(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTracklist(data) {
  if (!Array.isArray(data?.tracklist)) {
    return [];
  }

  return data.tracklist
    .filter((track) => track && track.type_ !== "heading")
    .map((track) => String(track.title || "").trim())
    .filter(Boolean);
}

async function getReleaseTrackSearchData(releaseId) {
  const normalizedReleaseId = normalizeReleaseId(releaseId);
  if (!normalizedReleaseId) {
    return null;
  }

  if (releaseTrackSearchById.has(normalizedReleaseId)) {
    return releaseTrackSearchById.get(normalizedReleaseId);
  }

  const response = await requestReleaseWithRetry(normalizedReleaseId);
  const data = await response.json();
  const primaryImage = data.images && data.images.length > 0 ? data.images[0] : null;

  const releaseTrackData = {
    release_id: normalizedReleaseId,
    title: data.title || "Unknown Album",
    year: data.year || "Unknown",
    artist:
      Array.isArray(data?.artists) && data.artists.length
        ? String(data.artists[0]?.name || "").replace(/\s*\(\d+\)$/, "")
        : "",
    label:
      Array.isArray(data?.labels) && data.labels.length
        ? data.labels[0]?.name || ""
        : "",
    thumb: primaryImage?.uri150 || data.thumb || primaryImage?.uri || null,
    cover: primaryImage?.uri || primaryImage?.uri150 || data.thumb || null,
    tracks: parseTracklist(data),
  };

  releaseTrackSearchById.set(normalizedReleaseId, releaseTrackData);
  return releaseTrackData;
}

export async function searchDiscogsTracks({ artist = "", track = "" }) {
  const normalizedArtist = String(artist || "").trim();
  const normalizedTrack = String(track || "").trim();

  if (!normalizedTrack) {
    return [];
  }

  const params = new URLSearchParams({
    type: "release",
    per_page: "12",
    q: `${normalizedArtist} ${normalizedTrack}`.trim(),
  });

  if (normalizedArtist) {
    params.set("artist", normalizedArtist);
  }

  params.set("track", normalizedTrack);

  const data = await requestDiscogsJson(`https://api.discogs.com/database/search?${params.toString()}`);
  const candidates = (Array.isArray(data?.results) ? data.results : [])
    .map(buildSearchCandidate)
    .filter((candidate) => candidate.release_id)
    .filter((candidate, index, list) => list.findIndex((entry) => entry.release_id === candidate.release_id) === index)
    .slice(0, 10);

  if (!candidates.length) {
    return [];
  }

  const normalizedTrackSearch = normalizeTrackSearchText(normalizedTrack);
  const matches = [];

  await Promise.all(
    candidates.map(async (candidate) => {
      try {
        const releaseTrackData = await getReleaseTrackSearchData(candidate.release_id);
        if (!releaseTrackData) {
          return;
        }

        const matchedTrack = releaseTrackData.tracks.find((trackTitle) => {
          const normalizedTrackTitle = normalizeTrackSearchText(trackTitle);
          return normalizedTrackTitle.includes(normalizedTrackSearch);
        });

        if (!matchedTrack) {
          return;
        }

        matches.push({
          release_id: candidate.release_id,
          artist: releaseTrackData.artist || candidate.Artist || normalizedArtist || "Unknown Artist",
          album: releaseTrackData.title || candidate.Title || "Unknown Album",
          year: releaseTrackData.year || candidate.Released || "Unknown",
          label: releaseTrackData.label || candidate.Label || "",
          matchedTrack,
          thumb: releaseTrackData.thumb || candidate.thumb || null,
          cover: releaseTrackData.cover || candidate.cover || candidate.thumb || null,
        });
      } catch {
        // Skip release-level failures so a single bad release does not fail the whole search.
      }
    })
  );

  return matches.slice(0, 6);
}

export async function searchDiscogsReleases({ barcode = "", query = "", artist = "", releaseId = "" }) {
  const normalizedReleaseId = normalizeReleaseId(releaseId);

  if (normalizedReleaseId) {
    const release = await getRelease(normalizedReleaseId, {
      artist,
      title: query,
    });

    return [{
      release_id: normalizedReleaseId,
      Artist: artist || "Unknown Artist",
      Title: query || release.title || "Unknown Album",
      Released: release.year || "Unknown",
      Label: release.label || "",
      thumb: release.thumb || null,
      cover: release.thumb || null,
      genres: release.genres || "",
      format: "Vinyl",
    }];
  }

  const params = new URLSearchParams({
    type: "release",
    per_page: "10",
  });

  const normalizedBarcode = String(barcode || "").trim();
  const normalizedQuery = String(query || "").trim();
  const normalizedArtist = String(artist || "").trim();

  if (normalizedBarcode) {
    params.set("barcode", normalizedBarcode);
  }

  if (normalizedQuery) {
    params.set("release_title", normalizedQuery);
  }

  if (normalizedArtist) {
    params.set("artist", normalizedArtist);
  }

  const hasSearchInput = normalizedBarcode || normalizedQuery || normalizedArtist;
  if (!hasSearchInput) {
    return [];
  }

  const data = await requestDiscogsJson(`https://api.discogs.com/database/search?${params.toString()}`);
  const results = Array.isArray(data?.results) ? data.results : [];

  return results
    .map(buildSearchCandidate)
    .filter((candidate) => candidate.release_id && candidate.Title);
}

async function requestReleaseOnce(releaseId) {
  const waitMs = discogsCooldownUntil - Date.now();
  if (waitMs > 0) {
    await wait(waitMs);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, RELEASE_REQUEST_TIMEOUT_MS);

  try {
    return await fetch(`https://api.discogs.com/releases/${releaseId}`, {
      headers: {
        Authorization: `Discogs token=${TOKEN}`,
        "User-Agent": "MusicAndMemories/1.0",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestReleaseWithRetry(releaseId) {
  let attempt = 0;

  while (attempt <= MAX_RELEASE_RETRIES) {
    let response;

    try {
      response = await requestReleaseOnce(releaseId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error || "");
      const isAbortError = error instanceof Error && error.name === "AbortError";
      const isRetriableNetworkError = /network|failed to fetch/i.test(errorMessage);

      if ((isAbortError || isRetriableNetworkError) && attempt < MAX_RELEASE_RETRIES) {
        await wait(400);
        attempt += 1;
        continue;
      }

      throw error;
    }

    if (response.ok) {
      discogsCooldownUntil = 0;
      return response;
    }

    const isRetriable = response.status === 429 || response.status >= 500;

    if (!isRetriable || attempt === MAX_RELEASE_RETRIES) {
      const bodyText = await response.text().catch(() => "");
      throw createDiscogsError(response.status, bodyText);
    }

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response) || 2500;
      discogsCooldownUntil = Date.now() + retryAfterMs;
      await wait(retryAfterMs);
    } else {
      await wait(900 * (attempt + 1));
    }

    attempt += 1;
  }

  throw new Error("Discogs request failed after retries.");
}

function getTraceStore() {
  if (typeof globalThis === "undefined") {
    return null;
  }

  return globalThis;
}

export async function getRelease(releaseId, fallbackContext = null) {
  const normalizedReleaseId = normalizeReleaseId(releaseId);
  if (!normalizedReleaseId) {
    throw new Error("Discogs release ID is required.");
  }

  if (releaseDataById.has(normalizedReleaseId)) {
    return releaseDataById.get(normalizedReleaseId);
  }

  if (inFlightReleaseById.has(normalizedReleaseId)) {
    return inFlightReleaseById.get(normalizedReleaseId);
  }

  const persistentReleaseDetails = getPersistentReleaseDetails(normalizedReleaseId);
  if (persistentReleaseDetails) {
    preloadArtworkImage(persistentReleaseDetails.thumb);
    releaseDataById.set(normalizedReleaseId, persistentReleaseDetails);
    return persistentReleaseDetails;
  }

  const request = requestReleaseWithRetry(normalizedReleaseId)
    .then((response) => response.json())
    .then(async (data) => {
      const images = Array.isArray(data.images) ? data.images : [];
      const primaryImage = images.find((entry) => entry?.type === "primary") || images[0] || null;
      const secondaryImage = images.find((entry) => entry && entry !== primaryImage) || null;
      let thumb = primaryImage?.uri150 || data.thumb || primaryImage?.uri || null;
      const image = primaryImage?.uri || thumb || null;
      const rearImage = secondaryImage?.uri || secondaryImage?.uri150 || null;

      if (!thumb) {
        thumb = await resolveFallbackArtworkUrl(fallbackContext);
      }

      const releaseDetails = {
        title: data.title,
        year: data.year,
        thumb,
        image: image || thumb || null,
        rearImage,
        label:
          data.labels && data.labels.length > 0
            ? data.labels[0].name
            : "",
        genres:
          data.genres && data.genres.length > 0
            ? data.genres.join(", ")
            : "",
      };

      preloadArtworkImage(thumb);

      releaseDataById.set(normalizedReleaseId, releaseDetails);
    setPersistentReleaseDetails(normalizedReleaseId, releaseDetails);

      const traceStore = getTraceStore();
      if (
        traceStore?.__MM_TRACE_FIRST_ALBUM__?.release_id &&
        String(traceStore.__MM_TRACE_FIRST_ALBUM__.release_id) === String(normalizedReleaseId)
      ) {
        console.log("[MM TRACE] 3.getRelease().thumb", {
          releaseId: normalizedReleaseId,
          hasImages: Boolean(data.images && data.images.length > 0),
          thumb,
        });
      }

      return releaseDetails;
    })
    .catch(async (error) => {
      const fallbackArtworkUrl = await resolveFallbackArtworkUrl(fallbackContext);

      if (fallbackArtworkUrl) {
        const fallbackDetails = buildItunesFallbackResult(fallbackArtworkUrl, fallbackContext);
        releaseDataById.set(normalizedReleaseId, fallbackDetails);
        setPersistentReleaseDetails(normalizedReleaseId, fallbackDetails);
        preloadArtworkImage(fallbackArtworkUrl);
        return fallbackDetails;
      }

      throw error;
    })
    .finally(() => {
      inFlightReleaseById.delete(normalizedReleaseId);
    });

  inFlightReleaseById.set(normalizedReleaseId, request);
  return request;
}