const TOKEN = import.meta.env.VITE_DISCOGS_TOKEN;

export async function getRelease(releaseId) {
  const response = await fetch(
    `https://api.discogs.com/releases/${releaseId}`,
    {
      headers: {
        Authorization: `Discogs token=${TOKEN}`,
        "User-Agent": "TheMemoryBox/1.0",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Discogs API error: ${response.status}`);
  }

  const data = await response.json();

  return {
    title: data.title,
    year: data.year,
    thumb:
      data.images && data.images.length > 0
        ? data.images[0].uri
        : null,
    label:
      data.labels && data.labels.length > 0
        ? data.labels[0].name
        : "",
  };
}