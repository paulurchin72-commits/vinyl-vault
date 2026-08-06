const TOKEN = import.meta.env.VITE_DISCOGS_TOKEN;

function getTraceStore() {
  if (typeof globalThis === "undefined") {
    return null;
  }

  return globalThis;
}

export async function getRelease(releaseId) {
  const response = await fetch(
    `https://api.discogs.com/releases/${releaseId}`,
    {
      headers: {
        Authorization: `Discogs token=${TOKEN}`,
        "User-Agent": "MusicAndMemories/1.0",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Discogs API error: ${response.status}`);
  }

  const data = await response.json();

  const thumb =
    data.images && data.images.length > 0
      ? data.images[0].uri
      : null;

  const traceStore = getTraceStore();
  if (traceStore?.__MM_TRACE_FIRST_ALBUM__?.release_id && String(traceStore.__MM_TRACE_FIRST_ALBUM__.release_id) === String(releaseId)) {
    console.log("[MM TRACE] 3.getRelease().thumb", {
      releaseId,
      hasImages: Boolean(data.images && data.images.length > 0),
      thumb,
    });
  }

  return {
    title: data.title,
    year: data.year,
    thumb,
    label:
      data.labels && data.labels.length > 0
        ? data.labels[0].name
        : "",
    genres:
      data.genres && data.genres.length > 0
        ? data.genres.join(", ")
        : "",
  };
}