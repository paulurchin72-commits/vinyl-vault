const DB_NAME = "music-and-memories-artwork-cache";
const DB_VERSION = 1;
const STORE_NAME = "artwork";

let dbPromise = null;

function normalizeReleaseId(releaseId) {
  if (releaseId === null || releaseId === undefined || releaseId === "") {
    throw new Error("A valid Discogs releaseId is required.");
  }

  return String(releaseId);
}

function ensureBlob(blob) {
  if (!(blob instanceof Blob)) {
    throw new Error("Artwork must be provided as a Blob.");
  }
}

function openDatabase() {
  if (dbPromise) {
    return dbPromise;
  }

  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "releaseId" });
      }
    };

    request.onsuccess = () => {
      const db = request.result;

      db.onversionchange = () => {
        db.close();
      };

      resolve(db);
    };

    request.onerror = () => {
      reject(request.error || new Error("Failed to open IndexedDB."));
    };
  });

  return dbPromise;
}

function runStoreRequest(mode, runOperation) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);

        let request;

        try {
          request = runOperation(store);
        } catch (error) {
          transaction.abort();
          reject(error);
          return;
        }

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onerror = () => {
          reject(request.error || new Error("IndexedDB request failed."));
        };

        transaction.onerror = () => {
          reject(transaction.error || new Error("IndexedDB transaction failed."));
        };

        transaction.onabort = () => {
          reject(transaction.error || new Error("IndexedDB transaction was aborted."));
        };
      })
  );
}

export async function saveArtwork(releaseId, blob) {
  const normalizedReleaseId = normalizeReleaseId(releaseId);
  ensureBlob(blob);

  const record = {
    releaseId: normalizedReleaseId,
    blob,
    byteSize: blob.size || 0,
    updatedAt: Date.now(),
  };

  await runStoreRequest("readwrite", (store) => store.put(record));
}

export async function getArtwork(releaseId) {
  const normalizedReleaseId = normalizeReleaseId(releaseId);
  const record = await runStoreRequest("readonly", (store) => store.get(normalizedReleaseId));
  return record?.blob || null;
}

export async function hasArtwork(releaseId) {
  const normalizedReleaseId = normalizeReleaseId(releaseId);
  const record = await runStoreRequest("readonly", (store) => store.get(normalizedReleaseId));
  return Boolean(record?.blob);
}

export async function deleteArtwork(releaseId) {
  const normalizedReleaseId = normalizeReleaseId(releaseId);
  await runStoreRequest("readwrite", (store) => store.delete(normalizedReleaseId));
}

export async function clearCache() {
  await runStoreRequest("readwrite", (store) => store.clear());
}

export async function getCacheStats() {
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const cursorRequest = store.openCursor();

    let count = 0;
    let totalBytes = 0;

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;

      if (!cursor) {
        resolve({ count, totalBytes });
        return;
      }

      const record = cursor.value;
      count += 1;
      totalBytes += Number(record?.byteSize || record?.blob?.size || 0);
      cursor.continue();
    };

    cursorRequest.onerror = () => {
      reject(cursorRequest.error || new Error("Failed to compute cache statistics."));
    };

    transaction.onerror = () => {
      reject(transaction.error || new Error("IndexedDB transaction failed."));
    };

    transaction.onabort = () => {
      reject(transaction.error || new Error("IndexedDB transaction was aborted."));
    };
  });
}