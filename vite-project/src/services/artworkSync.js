import { getRelease } from "./discogs";
import { saveArtwork } from "./artworkCache";

let syncState = {
  isSyncing: false,
  cancelled: false,
  total: 0,
  completed: 0,
  succeeded: 0,
  failed: 0,
  currentReleaseId: null,
  startedAt: null,
  finishedAt: null,
  results: [],
};

let cancelRequested = false;
let activeDownloadController = null;

function normalizeReleaseId(releaseId) {
  if (releaseId === null || releaseId === undefined || releaseId === "") {
    throw new Error("A valid Discogs releaseId is required.");
  }

  return String(releaseId);
}

function ensureNotSyncing() {
  if (syncState.isSyncing) {
    throw new Error("Artwork sync is already in progress.");
  }
}

function initializeProgress(total) {
  cancelRequested = false;
  syncState = {
    isSyncing: true,
    cancelled: false,
    total,
    completed: 0,
    succeeded: 0,
    failed: 0,
    currentReleaseId: null,
    startedAt: Date.now(),
    finishedAt: null,
    results: [],
  };
}

function finalizeProgress() {
  syncState = {
    ...syncState,
    isSyncing: false,
    cancelled: cancelRequested,
    currentReleaseId: null,
    finishedAt: Date.now(),
  };

  activeDownloadController = null;
}

async function downloadArtworkBlob(artworkUrl) {
  activeDownloadController = new AbortController();

  try {
    const response = await fetch(artworkUrl, { signal: activeDownloadController.signal });

    if (!response.ok) {
      throw new Error(`Artwork download failed: ${response.status}`);
    }

    return await response.blob();
  } finally {
    activeDownloadController = null;
  }
}

async function runSingleSync(normalizedReleaseId) {
  if (cancelRequested) {
    return {
      releaseId: normalizedReleaseId,
      success: false,
      skipped: true,
      reason: "Sync cancelled.",
    };
  }

  const releaseData = await getRelease(normalizedReleaseId);

  if (cancelRequested) {
    return {
      releaseId: normalizedReleaseId,
      success: false,
      skipped: true,
      reason: "Sync cancelled.",
    };
  }

  if (!releaseData?.thumb) {
    return {
      releaseId: normalizedReleaseId,
      success: false,
      skipped: true,
      reason: "No artwork available for this release.",
    };
  }

  const blob = await downloadArtworkBlob(releaseData.thumb);

  if (cancelRequested) {
    return {
      releaseId: normalizedReleaseId,
      success: false,
      skipped: true,
      reason: "Sync cancelled.",
    };
  }

  await saveArtwork(normalizedReleaseId, blob);

  return {
    releaseId: normalizedReleaseId,
    success: true,
    skipped: false,
  };
}

function collectBatchReleaseIds(releaseIds) {
  if (!Array.isArray(releaseIds)) {
    throw new Error("releaseIds must be an array.");
  }

  const uniqueIds = [];
  const seen = new Set();

  releaseIds.forEach((releaseId) => {
    const normalized = normalizeReleaseId(releaseId);

    if (!seen.has(normalized)) {
      seen.add(normalized);
      uniqueIds.push(normalized);
    }
  });

  return uniqueIds;
}

async function syncAndTrack(normalizedReleaseId) {
  syncState = {
    ...syncState,
    currentReleaseId: normalizedReleaseId,
  };

  try {
    const result = await runSingleSync(normalizedReleaseId);
    const wasSuccessful = Boolean(result.success);

    syncState = {
      ...syncState,
      completed: syncState.completed + 1,
      succeeded: syncState.succeeded + (wasSuccessful ? 1 : 0),
      failed: syncState.failed + (wasSuccessful ? 0 : 1),
      results: [...syncState.results, result],
    };

    return result;
  } catch (error) {
    const result = {
      releaseId: normalizedReleaseId,
      success: false,
      skipped: false,
      reason: error instanceof Error ? error.message : "Unknown sync error.",
    };

    syncState = {
      ...syncState,
      completed: syncState.completed + 1,
      failed: syncState.failed + 1,
      results: [...syncState.results, result],
    };

    return result;
  }
}

export async function syncArtwork(releaseId) {
  ensureNotSyncing();
  const normalizedReleaseId = normalizeReleaseId(releaseId);

  initializeProgress(1);

  try {
    const result = await syncAndTrack(normalizedReleaseId);
    return result;
  } finally {
    finalizeProgress();
  }
}

export async function syncArtworkBatch(releaseIds) {
  ensureNotSyncing();
  const normalizedReleaseIds = collectBatchReleaseIds(releaseIds);

  initializeProgress(normalizedReleaseIds.length);

  try {
    for (const releaseId of normalizedReleaseIds) {
      if (cancelRequested) {
        break;
      }

      await syncAndTrack(releaseId);
    }

    return getProgress();
  } finally {
    finalizeProgress();
  }
}

export function cancelSync() {
  if (!syncState.isSyncing) {
    return false;
  }

  cancelRequested = true;

  if (activeDownloadController) {
    activeDownloadController.abort();
  }

  return true;
}

export function getProgress() {
  return {
    ...syncState,
    results: [...syncState.results],
  };
}