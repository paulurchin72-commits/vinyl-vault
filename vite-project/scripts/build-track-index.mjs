import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";

const COLLECTION_CSV = path.resolve("public/Pault99-collection-20260803-1505.csv");
const OUTPUT_JSON = path.resolve("public/collection-track-index.json");
const DISCOGS_TOKEN = process.env.VITE_DISCOGS_TOKEN || process.env.DISCOGS_TOKEN || "";
const REQUEST_DELAY_MS = Number(process.env.TRACK_INDEX_DELAY_MS || 2500);

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function normalizeReleaseId(value) {
  return String(value || "").trim();
}

function normalizeTracklistEntries(tracklist) {
  if (!Array.isArray(tracklist)) {
    return [];
  }

  return tracklist
    .flatMap((track) => {
      if (!track || typeof track !== "object" || track.type_ === "heading") {
        return [];
      }

      if (Array.isArray(track.tracklist)) {
        return track.tracklist;
      }

      if (Array.isArray(track.track)) {
        return track.track;
      }

      return [track];
    })
    .map((track) => String(track?.title || track?.name || "").trim())
    .filter(Boolean);
}

async function readExistingIndex() {
  try {
    const fileText = await fs.readFile(OUTPUT_JSON, "utf8");
    const parsed = JSON.parse(fileText);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(entries) {
  const sortedEntries = [...entries].sort((firstEntry, secondEntry) => {
    const artistCompare = String(firstEntry.artist || "").localeCompare(String(secondEntry.artist || ""));
    if (artistCompare) {
      return artistCompare;
    }

    return String(firstEntry.album || "").localeCompare(String(secondEntry.album || ""));
  });

  await fs.writeFile(OUTPUT_JSON, `${JSON.stringify(sortedEntries, null, 2)}\n`);
}

async function fetchReleaseTracks(releaseId) {
  const response = await fetch(`https://api.discogs.com/releases/${releaseId}`, {
    headers: {
      ...(DISCOGS_TOKEN ? { Authorization: `Discogs token=${DISCOGS_TOKEN}` } : {}),
      "User-Agent": "MusicAndMemories/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Discogs ${response.status}`);
  }

  const release = await response.json();
  return normalizeTracklistEntries(release.tracklist);
}

function isRetryableError(message) {
  return /429|5\d\d|network|fetch|timeout/i.test(String(message || ""));
}

async function main() {
  const csvText = await fs.readFile(COLLECTION_CSV, "utf8");
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const records = Array.isArray(parsed.data) ? parsed.data : [];
  const existingEntries = await readExistingIndex();
  const entriesByReleaseId = new Map(
    existingEntries
      .filter((entry) => normalizeReleaseId(entry?.release_id) && Array.isArray(entry?.tracks) && !entry.retryable)
      .map((entry) => [normalizeReleaseId(entry.release_id), entry])
  );
  const uniqueRecords = records.filter((record, index, list) => {
    const releaseId = normalizeReleaseId(record.release_id);
    return releaseId && list.findIndex((candidate) => normalizeReleaseId(candidate.release_id) === releaseId) === index;
  });

  console.log(`Track index: ${entriesByReleaseId.size}/${uniqueRecords.length} releases already indexed.`);

  for (const record of uniqueRecords) {
    const releaseId = normalizeReleaseId(record.release_id);
    if (entriesByReleaseId.has(releaseId)) {
      continue;
    }

    try {
      const tracks = await fetchReleaseTracks(releaseId);
      entriesByReleaseId.set(releaseId, {
        release_id: releaseId,
        artist: record.Artist || "Unknown Artist",
        album: record.Title || "Unknown Album",
        year: record.Released || "",
        tracks,
        updatedAt: new Date().toISOString(),
      });
      console.log(`Indexed ${entriesByReleaseId.size}/${uniqueRecords.length}: ${record.Artist} - ${record.Title} (${tracks.length} tracks)`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "failed";
      entriesByReleaseId.set(releaseId, {
        release_id: releaseId,
        artist: record.Artist || "Unknown Artist",
        album: record.Title || "Unknown Album",
        year: record.Released || "",
        tracks: [],
        error: message,
        retryable: isRetryableError(message),
        updatedAt: new Date().toISOString(),
      });
      console.log(`Skipped ${record.Artist} - ${record.Title}: ${message}`);
    }

    await writeIndex(Array.from(entriesByReleaseId.values()));
    await wait(REQUEST_DELAY_MS);
  }

  await writeIndex(Array.from(entriesByReleaseId.values()));
  console.log(`Track index complete: ${entriesByReleaseId.size} releases written to ${OUTPUT_JSON}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
