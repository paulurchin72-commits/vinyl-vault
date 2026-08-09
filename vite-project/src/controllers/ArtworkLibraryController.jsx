import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasArtwork } from "../services/artworkCache";
import { cancelSync, getProgress, syncArtworkBatch } from "../services/artworkSync";

const PROGRESS_POLL_INTERVAL_MS = 250;

function normalizeReleaseId(value) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  return String(value);
}

function createProgressSnapshot(progress) {
  const completedCount = Number(progress?.completed || 0);
  const totalCount = Number(progress?.total || 0);
  const percentage = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return {
    currentAlbum: progress?.currentReleaseId ? String(progress.currentReleaseId) : "",
    completedCount,
    totalCount,
    percentage,
    failures: Number(progress?.failed || 0),
    raw: progress || null,
  };
}

function buildInitialCacheStatus(totalAlbums = 0) {
  return {
    totalAlbums,
    cachedArtworkCount: 0,
    missingArtworkCount: totalAlbums,
    missingReleaseIds: [],
    checkedAt: null,
  };
}

function ArtworkLibraryController({ records = [], ArtworkLibraryComponent, onSyncComplete }) {
  const requestVersionRef = useRef(0);
  const pollTimerRef = useRef(null);

  const [cacheStatus, setCacheStatus] = useState(() => buildInitialCacheStatus(records.length));
  const [syncProgress, setSyncProgress] = useState(() => createProgressSnapshot(getProgress()));
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState("");

  const albumReleaseIds = useMemo(
    () => records.map((record) => normalizeReleaseId(record?.release_id)),
    [records]
  );

  const totalAlbums = records.length;

  const stopProgressPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const startProgressPolling = useCallback(() => {
    stopProgressPolling();

    pollTimerRef.current = setInterval(() => {
      setSyncProgress(createProgressSnapshot(getProgress()));
    }, PROGRESS_POLL_INTERVAL_MS);
  }, [stopProgressPolling]);

  const refreshCacheStatus = useCallback(async () => {
    const currentRequest = requestVersionRef.current + 1;
    requestVersionRef.current = currentRequest;

    const cacheHits = await Promise.all(
      albumReleaseIds.map(async (releaseId) => {
        if (!releaseId) {
          return false;
        }

        try {
          return await hasArtwork(releaseId);
        } catch {
          return false;
        }
      })
    );

    if (requestVersionRef.current !== currentRequest) {
      return null;
    }

    const cachedArtworkCount = cacheHits.filter(Boolean).length;
    const missingArtworkCount = totalAlbums - cachedArtworkCount;
    const missingReleaseIds = Array.from(
      new Set(
        albumReleaseIds.filter((releaseId, index) => {
          return Boolean(releaseId) && !cacheHits[index];
        })
      )
    );

    const nextCacheStatus = {
      totalAlbums,
      cachedArtworkCount,
      missingArtworkCount,
      missingReleaseIds,
      checkedAt: Date.now(),
    };

    setCacheStatus(nextCacheStatus);
    return nextCacheStatus;
  }, [albumReleaseIds, totalAlbums]);

  const runSync = useCallback(
    async (releaseIds) => {
      console.log("[Artwork] runSync start", releaseIds);
      setError("");
      setIsPaused(false);

      if (!releaseIds.length) {
        setSyncProgress(
          createProgressSnapshot({
            completed: 0,
            total: 0,
            failed: 0,
            currentReleaseId: null,
          })
        );
        return;
      }

      setIsSyncing(true);
      console.log("[Artwork] setIsSyncing(true)");
      setSyncProgress(
        createProgressSnapshot({
          completed: 0,
          total: releaseIds.length,
          failed: 0,
          currentReleaseId: null,
        })
      );

      startProgressPolling();

      try {
        console.log("[Artwork] before syncArtworkBatch", releaseIds);
        const recordsToSync = releaseIds.map((releaseId) => ({ release_id: releaseId }));
        await syncArtworkBatch(recordsToSync);
        console.log("[Artwork] after syncArtworkBatch");
      } catch (syncError) {
        console.error("[Artwork] syncArtworkBatch error", syncError);
        setError(syncError instanceof Error ? syncError.message : "Artwork sync failed.");
      } finally {
        stopProgressPolling();

        const finalProgress = getProgress();
        setSyncProgress(createProgressSnapshot(finalProgress));
        setIsSyncing(false);
        setIsPaused(Boolean(finalProgress?.cancelled));

        const nextCacheStatus = await refreshCacheStatus();

        if (typeof onSyncComplete === "function") {
          onSyncComplete({
            progress: finalProgress,
            cacheStatus: nextCacheStatus,
          });
        }
      }
    },
    [onSyncComplete, refreshCacheStatus, startProgressPolling, stopProgressPolling]
  );

  const handleStart = useCallback(() => {
    console.log("[Artwork] handleStart");
    if (isSyncing) {
      return;
    }

    console.log("[Artwork] before runSync", cacheStatus.missingReleaseIds);
    void runSync(cacheStatus.missingReleaseIds);
  }, [cacheStatus.missingReleaseIds, isSyncing, runSync]);

  const handlePause = useCallback(() => {
    if (!isSyncing) {
      return;
    }

    const didCancel = cancelSync();

    if (didCancel) {
      setIsPaused(true);
    }
  }, [isSyncing]);

  const handleResume = useCallback(async () => {
    if (isSyncing) {
      return;
    }

    const nextCacheStatus = await refreshCacheStatus();
    const releaseIds = nextCacheStatus?.missingReleaseIds || [];
    await runSync(releaseIds);
  }, [isSyncing, refreshCacheStatus, runSync]);

  useEffect(() => {
    setCacheStatus(buildInitialCacheStatus(totalAlbums));
    void refreshCacheStatus();
  }, [refreshCacheStatus, totalAlbums]);

  useEffect(() => {
    return () => {
      stopProgressPolling();
    };
  }, [stopProgressPolling]);

  if (typeof ArtworkLibraryComponent !== "function") {
    return null;
  }

  const canStart = !isSyncing && cacheStatus.missingArtworkCount > 0;
  const canPause = isSyncing;
  const canResume = !isSyncing && isPaused && cacheStatus.missingArtworkCount > 0;

  return (
    <ArtworkLibraryComponent
      records={records}
      totalAlbums={cacheStatus.totalAlbums}
      cacheStatus={cacheStatus}
      cachedArtworkCount={cacheStatus.cachedArtworkCount}
      missingArtworkCount={cacheStatus.missingArtworkCount}
      syncProgress={syncProgress}
      currentAlbum={syncProgress.currentAlbum}
      completedCount={syncProgress.completedCount}
      totalCount={syncProgress.totalCount}
      percentage={syncProgress.percentage}
      failures={syncProgress.failures}
      isSyncing={isSyncing}
      isRunning={isSyncing}
      isPaused={isPaused}
      canStart={canStart}
      canPause={canPause}
      canResume={canResume}
      error={error}
      onStart={handleStart}
      onPause={handlePause}
      onResume={handleResume}
      onRefreshCacheStatus={refreshCacheStatus}
    />
  );
}

export default ArtworkLibraryController;
