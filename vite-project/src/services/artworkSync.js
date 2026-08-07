import { getRelease } from "./discogs";
import { hasArtwork, saveArtwork } from "./artworkCache";

function normalizeReleaseId(releaseId) {
  if (releaseId === null || releaseId === undefined || releaseId === "") {
    return "";
  }

  return String(releaseId);
}

function collectUniqueReleaseIds(records) {
  if (!Array.isArray(records)) {
    throw new Error("records must be an array.");
  }

  const seen = new Set();
  const releaseIds = [];

  records.forEach((record) => {
    const releaseId = normalizeReleaseId(record?.release_id);

    if (!releaseId || seen.has(releaseId)) {
      return;
    }

    seen.add(releaseId);
    releaseIds.push(releaseId);
  });

  return releaseIds;
}

async function downloadArtworkBlob(artworkUrl) {
  const response = await fetch(artworkUrl);

  if (!response.ok) {
    throw new Error(`Artwork download failed: ${response.status}`);
  }

  return response.blob();
}

function createInitialProgress(total) {
  return {
    total,
    completed: 0,
    succeeded: 0,
    failed: 0,
    skippedCached: 0,
    skippedUnavailable: 0,
    startedAt: Date.now(),
    finishedAt: null,
    currentReleaseId: null,
    results: [],
    updates: [],
  };
}

function createUpdate(progress, result) {
  const percentage = progress.total
    ? Math.round((progress.completed / progress.total) * 100)
    : 100;

  return {
    total: progress.total,
    completed: progress.completed,
    succeeded: progress.succeeded,
    failed: progress.failed,
    skippedCached: progress.skippedCached,
    skippedUnavailable: progress.skippedUnavailable,
    percentage,
    currentReleaseId: progress.currentReleaseId,
    result,
    timestamp: Date.now(),
  };
}

function appendProgress(progress, result, onProgress) {
  progress.completed += 1;
  progress.currentReleaseId = result.releaseId;
  progress.results.push(result);

  if (result.status === "synced") {
    progress.succeeded += 1;
  } else if (result.status === "failed") {
    progress.failed += 1;
  } else if (result.status === "cached") {
    progress.skippedCached += 1;
  } else {
    progress.skippedUnavailable += 1;
  }

  const update = createUpdate(progress, result);
  progress.updates.push(update);

  if (typeof onProgress === "function") {
    onProgress(update);
  }
}

export async function syncArtworkBatch(records, options = {}) {
  const onProgress = options?.onProgress;
  const releaseIds = collectUniqueReleaseIds(records);
  const progress = createInitialProgress(releaseIds.length);

  for (const releaseId of releaseIds) {
    try {
      const cached = await hasArtwork(releaseId);

      if (cached) {
        appendProgress(
          progress,
          {
            releaseId,
            status: "cached",
            success: true,
            message: "Artwork already cached.",
          },
          onProgress
        );
        continue;
      }

      const releaseData = await getRelease(releaseId);

      if (!releaseData?.thumb) {
        appendProgress(
          progress,
          {
            releaseId,
            status: "unavailable",
            success: false,
            message: "No artwork available for this release.",
          },
          onProgress
        );
        continue;
      }

      const blob = await downloadArtworkBlob(releaseData.thumb);
      await saveArtwork(releaseId, blob);

      appendProgress(
        progress,
        {
          releaseId,
          status: "synced",
          success: true,
          message: "Artwork downloaded and cached.",
          thumbUrl: releaseData.thumb,
        },
        onProgress
      );
    } catch (error) {
      appendProgress(
        progress,
        {
          releaseId,
          status: "failed",
          success: false,
          message: error instanceof Error ? error.message : "Unknown sync error.",
        },
        onProgress
      );
    }
  }

  progress.currentReleaseId = null;
  progress.finishedAt = Date.now();

  return {
    ...progress,
    results: [...progress.results],
    updates: [...progress.updates],
  };
}