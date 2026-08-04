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

  return response.json();
}