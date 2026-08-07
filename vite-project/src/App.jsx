import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import Papa from "papaparse";
import { getRelease } from "./services/discogs";
import artworkManager from "./services/artworkManager";
import AlbumCard from "./components/AlbumCard";
import AddMusicPage from "./components/AddMusicPage";
import AlbumModal from "./components/AlbumModal";
import ArtistCollectionView from "./components/ArtistCollectionView";
import ArtistsDirectoryView from "./components/ArtistsDirectoryView";
import BottomPlayer from "./components/dashboard/BottomPlayer";
import CollectionStats from "./components/dashboard/CollectionStats";
import ContinueListening from "./components/dashboard/ContinueListening";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import DuplicateDetectorPage from "./components/DuplicateDetectorPage";
import HeroSection from "./components/dashboard/HeroSection";
import HomeTrackSearch from "./components/dashboard/HomeTrackSearch";
import RandomMemory from "./components/dashboard/RandomMemory";
import RecentlyAdded from "./components/dashboard/RecentlyAdded";
import TonightsPick from "./components/dashboard/TonightsPick";
import PlaceholderPage from "./components/PlaceholderPage";
import mmMonogramLogo from "./assets/mm-monogram-logo.svg";
import "./App.css";

function getTraceStore() {
  if (typeof globalThis === "undefined") {
    return null;
  }

  return globalThis;
}

function logTraceStage(stage, payload, options = {}) {
  const traceStore = getTraceStore();
  if (!traceStore) {
    return;
  }

  const traceAlbum = traceStore.__MM_TRACE_FIRST_ALBUM__;
  if (!traceAlbum) {
    return;
  }

  if (options.once) {
    traceStore.__MM_TRACE_ONCE__ ||= {};
    const onceKey = `${stage}:${traceAlbum.albumKey}`;
    if (traceStore.__MM_TRACE_ONCE__[onceKey]) {
      return;
    }
    traceStore.__MM_TRACE_ONCE__[onceKey] = true;
  }

  console.log(`[MM TRACE] ${stage}`, payload);
}

function isTracedAlbumKey(traceStore, albumKey) {
  return (
    traceStore?.__MM_TRACE_FIRST_ALBUM__?.albumKey === albumKey ||
    traceStore?.__MM_TRACE_SUCCESS_ALBUM__?.albumKey === albumKey
  );
}

const SAVED_MEMORIES_KEY = "the-memory-box:saved-memories";
const RECENTLY_VIEWED_KEY = "the-memory-box:recently-viewed";
const ADDED_RECORDS_KEY = "the-memory-box:added-records";
const CUSTOM_ARTWORK_KEY = "the-memory-box:custom-artwork";
const ROLLING_STONE_LIST_KEY = "the-memory-box:rolling-stone-top-500";
const ROLLING_STONE_GIST_API = "https://api.github.com/gists/232302a4ba29fd8f5f0d0352ef55d2b9";
const RECENTLY_VIEWED_LIMIT = 10;
const LETTER_FILTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0-9", "ALL"];
const NAV_ITEMS = [
  { to: "/home", label: "🏠 Home" },
  { to: "/collection", label: "📀 Collection" },
  { to: "/add-music", label: "➕ Add Music" },
  { to: "/artists", label: "🎤 Artists" },
  { to: "/duplicates", label: "🧬 Duplicates" },
  { to: "/favourites", label: "❤️ Favourites" },
  { to: "/top-rated", label: "⭐ Top Rated" },
  { to: "/insights", label: "📊 Insights" },
  { to: "/memories", label: "📝 Memories" },
  { to: "/settings", label: "⚙ Settings" },
];

function loadStoredJson(key, fallbackValue) {
  try {
    const storedValue = localStorage.getItem(key);
    return storedValue ? JSON.parse(storedValue) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function loadSavedMemories() {
  return loadStoredJson(SAVED_MEMORIES_KEY, {});
}

function loadRecentlyViewed() {
  const storedValue = loadStoredJson(RECENTLY_VIEWED_KEY, []);

  if (!Array.isArray(storedValue)) {
    return [];
  }

  return storedValue
    .map((entry) => {
      if (typeof entry === "string") {
        return {
          albumKey: entry,
          release_id: null,
          artist: "",
          album: "",
          artwork: null,
          viewedAt: null,
        };
      }

      if (!entry || typeof entry !== "object" || !entry.albumKey) {
        return null;
      }

      return {
        albumKey: entry.albumKey,
        release_id: entry.release_id || entry.releaseId || null,
        artist: entry.artist || "",
        album: entry.album || "",
        artwork: entry.artwork || null,
        viewedAt: entry.viewedAt || null,
      };
    })
    .filter(Boolean)
    .slice(0, RECENTLY_VIEWED_LIMIT);
}

function loadAddedRecords() {
  const storedValue = loadStoredJson(ADDED_RECORDS_KEY, []);

  if (!Array.isArray(storedValue)) {
    return [];
  }

  return storedValue
    .filter((record) => record && typeof record === "object" && record.Artist && record.Title)
    .map((record, index) => ({
      ...record,
      __rowIndex: record.__rowIndex ?? `added-${index}`,
    }));
}

function loadRollingStoneList() {
  const storedValue = loadStoredJson(ROLLING_STONE_LIST_KEY, []);

  if (!Array.isArray(storedValue)) {
    return [];
  }

  return storedValue
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const artist = String(entry.artist || entry.Artist || "").trim();
      const album = String(entry.album || entry.Album || entry.title || entry.Title || "").trim();

      if (!artist || !album) {
        return null;
      }

      return {
        rank: entry.rank || entry.Rank || "",
        artist,
        album,
      };
    })
    .filter(Boolean);
}

function normalizeMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeRollingStoneRows(rows) {
  return rows
    .map((entry) => {
      const artist = String(entry.artist || entry.Artist || "").trim();
      const album = String(entry.album || entry.Album || entry.title || entry.Title || "").trim();

      if (!artist || !album) {
        return null;
      }

      return {
        rank: entry.rank || entry.Rank || "",
        artist,
        album,
      };
    })
    .filter(Boolean)
    .slice(0, 500);
}

function parseRollingStoneTable(tableElement) {
  if (!tableElement) {
    return [];
  }

  const rows = Array.from(tableElement.querySelectorAll("tr"));
  const parsedRows = rows
    .map((row) => {
      const cells = Array.from(row.querySelectorAll("th, td"));
      if (cells.length < 3) {
        return null;
      }

      const rank = Number.parseInt((cells[0].textContent || "").replace(/[^0-9]/g, ""), 10);
      if (!Number.isFinite(rank) || rank < 1 || rank > 500) {
        return null;
      }

      const album = String(cells[1].textContent || "").replace(/\s+/g, " ").replace(/^"|"$/g, "").trim();
      const artist = String(cells[2].textContent || "").replace(/\s+/g, " ").trim();

      if (!album || !artist) {
        return null;
      }

      return {
        rank,
        artist,
        album,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank);

  const dedupedByRank = new Map();
  parsedRows.forEach((entry) => {
    if (!dedupedByRank.has(entry.rank)) {
      dedupedByRank.set(entry.rank, entry);
    }
  });

  return Array.from(dedupedByRank.values()).sort((a, b) => a.rank - b.rank);
}

function parseRollingStoneFromWikipediaHtml(htmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");

  const headingCandidates = [
    "2020_revision",
    "2020_list",
    "2020",
  ];

  for (const headingId of headingCandidates) {
    const heading = doc.getElementById(headingId);
    if (!heading) {
      continue;
    }

    const sectionHeading = heading.closest("h2, h3, h4");
    let probe = sectionHeading?.nextElementSibling || heading.nextElementSibling;
    while (probe && probe.tagName !== "TABLE") {
      probe = probe.nextElementSibling;
    }

    const sectionRows = [];
    while (probe) {
      if (/^H[1-4]$/.test(probe.tagName)) {
        break;
      }

      if (probe.tagName === "TABLE") {
        sectionRows.push(...parseRollingStoneTable(probe));
      }

      probe = probe.nextElementSibling;
    }

    const dedupedRows = Array.from(
      sectionRows.reduce((byRank, entry) => {
        if (!byRank.has(entry.rank)) {
          byRank.set(entry.rank, entry);
        }
        return byRank;
      }, new Map()).values()
    ).sort((a, b) => a.rank - b.rank);

    if (dedupedRows.length >= 300) {
      return dedupedRows;
    }
  }

  const allRows = Array.from(doc.querySelectorAll("table.wikitable")).flatMap((table) =>
    parseRollingStoneTable(table)
  );

  const dedupedAllRows = Array.from(
    allRows.reduce((byRank, entry) => {
      if (!byRank.has(entry.rank)) {
        byRank.set(entry.rank, entry);
      }
      return byRank;
    }, new Map()).values()
  ).sort((a, b) => a.rank - b.rank);

  if (dedupedAllRows.length >= 300) {
    return dedupedAllRows;
  }

  return [];
}

function isLikelyTop500List(rows) {
  if (!rows.length) {
    return false;
  }

  const ranks = new Set(rows.map((entry) => Number(entry.rank)).filter((rank) => Number.isFinite(rank)));
  return rows.length >= 300 && ranks.has(1) && ranks.size >= 250;
}

async function fetchRollingStoneListFromGist() {
  const gistResponse = await fetch(ROLLING_STONE_GIST_API);
  if (!gistResponse.ok) {
    throw new Error(`Gist lookup failed (${gistResponse.status}).`);
  }

  const gistData = await gistResponse.json();
  const files = Object.values(gistData?.files || {});
  const csvFile = files.find((file) => String(file?.filename || "").toLowerCase().endsWith(".csv"));

  if (!csvFile?.raw_url) {
    throw new Error("No CSV file found in gist source.");
  }

  const csvResponse = await fetch(csvFile.raw_url);
  if (!csvResponse.ok) {
    throw new Error(`Gist CSV download failed (${csvResponse.status}).`);
  }

  const csvText = await csvResponse.text();
  const parsedCsv = Papa.parse(csvText, { header: true, skipEmptyLines: true });
  const parsedRows = Array.isArray(parsedCsv.data) ? parsedCsv.data : [];

  return normalizeRollingStoneRows(parsedRows);
}

function normalizeReleaseId(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const normalizedValue = String(value).trim();
  return normalizedValue || null;
}

function isTransientArtworkError(errorMessage) {
  if (!errorMessage) {
    return false;
  }

  return /(429|5\d\d|network|failed to fetch|timeout)/i.test(String(errorMessage));
}

function App() {
  const navigate = useNavigate();
  const [baseRecords, setBaseRecords] = useState([]);
  const [addedRecords, setAddedRecords] = useState(() => loadAddedRecords());
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [savedAlbumDetails, setSavedAlbumDetails] = useState(() => loadSavedMemories());
  const [surpriseSelection, setSurpriseSelection] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [collectionSort, setCollectionSort] = useState("artist-asc");
  const [collectionView, setCollectionView] = useState("grid");
  const [collectionLetter, setCollectionLetter] = useState("A");
  const [recentlyViewed, setRecentlyViewed] = useState(() => loadRecentlyViewed());
  const [artworkEntries, setArtworkEntries] = useState(() => artworkManager.getSnapshot());
  const [customArtworkByAlbumKey, setCustomArtworkByAlbumKey] = useState(() =>
    loadStoredJson(CUSTOM_ARTWORK_KEY, {})
  );
  const [rollingStoneList, setRollingStoneList] = useState(() => loadRollingStoneList());
  const [rollingStoneStatus, setRollingStoneStatus] = useState("");
  const records = useMemo(() => [...addedRecords, ...baseRecords], [addedRecords, baseRecords]);
  const recentlyViewedAlbumKeys = recentlyViewed.map((entry) => entry.albumKey);

  useEffect(() => {
    function handlePopState() {
      setSelectedAlbum((currentAlbum) => (currentAlbum ? null : currentAlbum));
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    Papa.parse("/Pault99-collection-20260803-1505.csv", {
      download: true,
      header: true,
      complete: (results) => {
        setBaseRecords(
          results.data
            .filter((record) => record.Artist && record.Title)
            .map((record, rowIndex) => ({
              ...record,
              __rowIndex: rowIndex,
            }))
        );
      },
    });
  }, []);

  useEffect(() => {
  }, [records]);

  function addRecordToCollection(record) {
    const normalizedReleaseId = normalizeReleaseId(record.release_id || record.releaseId);
    const nextRecord = {
      Artist: record.Artist || record.artist || "Unknown Artist",
      Title: record.Title || record.title || "Unknown Album",
      Released: record.Released || record.year || "Unknown",
      Label: record.Label || record.label || "",
      Format: record.Format || "Vinyl",
      Rating: record.Rating || "",
      release_id: normalizedReleaseId,
      CollectionFolder: record.CollectionFolder || "1",
      "Date Added": record["Date Added"] || new Date().toISOString(),
      cover: record.cover || record.thumb || null,
      thumb: record.thumb || record.cover || null,
      genres: record.genres || "",
      __rowIndex: `added-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    };

    const recordKey = getAlbumKey(nextRecord);

    setAddedRecords((currentRecords) => {
      const alreadyExists = currentRecords.some((currentRecord) => getAlbumKey(currentRecord) === recordKey)
        || baseRecords.some((currentRecord) => getAlbumKey(currentRecord) === recordKey);

      if (alreadyExists) {
        setMessage("Album is already in your collection.");
        return currentRecords;
      }

      const nextRecords = [nextRecord, ...currentRecords];

      try {
        localStorage.setItem(ADDED_RECORDS_KEY, JSON.stringify(nextRecords));
      } catch {
        // Ignore storage failures and keep in-memory additions.
      }

      setMessage(`Added ${nextRecord.Title} by ${nextRecord.Artist} to your collection.`);
      return nextRecords;
    });

    navigate("/collection");
  }

  function getAlbumKey(album) {
    return album.albumKey || album.release_id || `${album.Artist}-${album.Title}-${album.Released}`;
  }

  function getRecordListKey(record) {
    const instanceId = record.instance_id || record.instanceId || record.InstanceID;

    if (instanceId) {
      return `instance-${instanceId}`;
    }

    return `${getAlbumKey(record)}::row-${record.__rowIndex}`;
  }

  function getAlbumCardId(albumKey) {
    return `album-card-${String(albumKey).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  }

  function getReleaseYear(record) {
    return Number(record.Released);
  }

  function getSavedAlbum(record) {
    return savedAlbumDetails[getAlbumKey(record)] || {};
  }

  function getArtworkEntry(record) {
    const albumKey = getAlbumKey(record);
    const customArtworkUrl = customArtworkByAlbumKey[albumKey] || null;

    if (customArtworkUrl) {
      return {
        status: "loaded",
        coverUrl: customArtworkUrl,
        releaseData: null,
        error: null,
      };
    }

    const entry = artworkEntries[albumKey] || {
      status: "idle",
      coverUrl: null,
      releaseData: null,
    };

    const traceStore = getTraceStore();
    if (isTracedAlbumKey(traceStore, albumKey)) {
      const snapshotKey = `${entry.status}|${entry.coverUrl || ""}`;
      if (traceStore.__MM_TRACE_LAST_GET_ARTWORK_ENTRY__ !== snapshotKey) {
        traceStore.__MM_TRACE_LAST_GET_ARTWORK_ENTRY__ = snapshotKey;
        logTraceStage("5.getArtworkEntry()", {
          albumKey,
          entry,
        });
      }
    }

    return entry;
  }

  function refreshArtworkEntries() {
    setArtworkEntries(artworkManager.getSnapshot());
  }

  function updateRecentlyViewedArtwork(albumKey, coverUrl) {
    if (!coverUrl) {
      return;
    }

    setRecentlyViewed((currentAlbums) => {
      let hasChanged = false;

      const nextAlbums = currentAlbums.map((entry) => {
        if (entry.albumKey !== albumKey || entry.artwork === coverUrl) {
          return entry;
        }

        hasChanged = true;
        return {
          ...entry,
          artwork: coverUrl,
        };
      });

      if (!hasChanged) {
        return currentAlbums;
      }

      try {
        localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(nextAlbums));
      } catch {
        // Ignore storage failures and keep the in-memory state update.
      }

      return nextAlbums;
    });
  }

  function handleAlbumCardVisible(record) {
    const albumKey = getAlbumKey(record);
    const albumWithKey = {
      ...record,
      albumKey,
    };

    const currentEntry = artworkManager.getEntry(albumKey);
    if (currentEntry.status === "loaded" || currentEntry.status === "missing") {
      return;
    }

    const request = artworkManager.ensureAlbumArtwork(albumWithKey, getRelease);
    refreshArtworkEntries();

    Promise.resolve(request).then(async (nextArtworkEntry) => {
      let resolvedArtworkEntry = nextArtworkEntry;

      if (
        nextArtworkEntry?.status === "idle" &&
        isTransientArtworkError(nextArtworkEntry?.error)
      ) {
        // Retry once for transient API/network failures on first visibility load.
        resolvedArtworkEntry = await artworkManager.ensureAlbumArtwork(albumWithKey, getRelease);
      }

      refreshArtworkEntries();
      updateRecentlyViewedArtwork(albumKey, resolvedArtworkEntry.coverUrl);

      setSelectedAlbum((currentAlbum) => {
        if (!currentAlbum || currentAlbum.albumKey !== albumKey) {
          return currentAlbum;
        }

        const savedDetails = savedAlbumDetails[albumKey] || {};
        return {
          ...currentAlbum,
          ...mergeAlbumWithArtwork(record, savedDetails, resolvedArtworkEntry),
          albumKey,
        };
      });
    });
  }

  function mergeAlbumWithArtwork(record, savedAlbum, artworkEntry) {
    return {
      ...record,
      ...savedAlbum,
      cover: artworkEntry.coverUrl,
      artworkStatus: artworkEntry.status,
      year: artworkEntry.releaseData?.year || record.Released,
      label: artworkEntry.releaseData?.label || record.Label || "",
      genres: artworkEntry.releaseData?.genres || record.genres || "",
    };
  }

  function formatViewedDateTime(value) {
    if (!value) {
      return "Recently viewed";
    }

    const parsedDate = new Date(value);

    if (Number.isNaN(parsedDate.getTime())) {
      return "Recently viewed";
    }

    return parsedDate.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  const searchQuery = search.toLowerCase();
  const searchMatchedRecords = records.filter((record) =>
    `${record.Artist} ${record.Title}`.toLowerCase().includes(searchQuery)
  );

  const rollingStoneOwnedAlbumKeySet = useMemo(() => {
    if (!rollingStoneList.length) {
      return new Set();
    }

    const rollingStoneKeySet = new Set(
      rollingStoneList.map((entry) => `${normalizeMatchText(entry.artist)}|||${normalizeMatchText(entry.album)}`)
    );
    const ownedAlbumKeys = new Set();

    records.forEach((record) => {
      const key = `${normalizeMatchText(record.Artist)}|||${normalizeMatchText(record.Title)}`;
      if (rollingStoneKeySet.has(key)) {
        ownedAlbumKeys.add(getAlbumKey(record));
      }
    });

    return ownedAlbumKeys;
  }, [rollingStoneList, records]);

  const quickFilters = [
    { id: "all", label: "All Records" },
    { id: "favorites", label: "❤️ Favourites" },
    { id: "rated5", label: "⭐ Top Rated" },
    { id: "memories", label: "📝 Has Memories" },
    { id: "1970s", label: "📅 1970s" },
    { id: "1980s", label: "📅 1980s" },
    { id: "1990s", label: "📅 1990s" },
    { id: "2000plus", label: "📅 2000+" },
    { id: "recent", label: "🎲 Recently Viewed" },
  ];

  function recordMatchesFilter(record, filterId) {
    const savedAlbum = getSavedAlbum(record);
    const releaseYear = getReleaseYear(record);
    const albumKey = getAlbumKey(record);

    switch (filterId) {
      case "favorites":
        return Boolean(savedAlbum.favorite);
      case "rated5":
        if (rollingStoneList.length) {
          return rollingStoneOwnedAlbumKeySet.has(albumKey);
        }
        return Number(savedAlbum.rating) === 5;
      case "memories":
        return Boolean(savedAlbum.memory?.trim());
      case "1970s":
        return releaseYear >= 1970 && releaseYear <= 1979;
      case "1980s":
        return releaseYear >= 1980 && releaseYear <= 1989;
      case "1990s":
        return releaseYear >= 1990 && releaseYear <= 1999;
      case "2000plus":
        return releaseYear >= 2000;
      case "recent":
        return recentlyViewedAlbumKeys.includes(albumKey);
      case "all":
      default:
        return true;
    }
  }

  const filteredRecords = searchMatchedRecords.filter((record) =>
    recordMatchesFilter(record, activeFilter)
  );

  const letterFilteredRecords = useMemo(() => {
    const hasSearch = Boolean(searchQuery.trim());
    const isQuickFilterActive = activeFilter !== "all";

    if (hasSearch || isQuickFilterActive || !collectionLetter || collectionLetter === "ALL") {
      return filteredRecords;
    }

    return filteredRecords.filter((record) => {
      const artist = (record.Artist || "").trim();
      if (!artist) {
        return false;
      }

      if (collectionLetter === "0-9") {
        return /^\d/.test(artist);
      }

      return artist[0].toUpperCase() === collectionLetter;
    });
  }, [filteredRecords, collectionLetter, searchQuery, activeFilter]);

  const activeQuickFilter = quickFilters.find((filter) => filter.id === activeFilter) || quickFilters[0];

  const collectionFilterLabel =
    activeFilter !== "all"
      ? `${activeQuickFilter.label} filter`
      : collectionLetter === "ALL"
        ? "All artists"
        : collectionLetter === "0-9"
          ? "0-9 artists"
          : `${collectionLetter} artists`;

  const sortedCollectionRecords = useMemo(() => {
    const sortedRecords = [...letterFilteredRecords];

    sortedRecords.sort((firstRecord, secondRecord) => {
      const firstArtist = firstRecord.Artist || "Unknown Artist";
      const secondArtist = secondRecord.Artist || "Unknown Artist";
      const firstTitle = firstRecord.Title || "Unknown Album";
      const secondTitle = secondRecord.Title || "Unknown Album";
      const firstYear = Number(firstRecord.Released) || 0;
      const secondYear = Number(secondRecord.Released) || 0;

      switch (collectionSort) {
        case "artist-desc":
          return secondArtist.localeCompare(firstArtist) || secondTitle.localeCompare(firstTitle);
        case "album-asc":
          return firstTitle.localeCompare(secondTitle) || firstArtist.localeCompare(secondArtist);
        case "album-desc":
          return secondTitle.localeCompare(firstTitle) || secondArtist.localeCompare(firstArtist);
        case "year-newest":
          return secondYear - firstYear || firstArtist.localeCompare(secondArtist) || firstTitle.localeCompare(secondTitle);
        case "year-oldest":
          return firstYear - secondYear || firstArtist.localeCompare(secondArtist) || firstTitle.localeCompare(secondTitle);
        case "artist-asc":
        default:
          return firstArtist.localeCompare(secondArtist) || firstTitle.localeCompare(secondTitle);
      }
    });

    return sortedRecords;
  }, [letterFilteredRecords, collectionSort]);

  const collectionArtworkProgress = useMemo(() => {
    return sortedCollectionRecords.reduce(
      (progress, record) => {
        const albumKey = getAlbumKey(record);
        const entry = artworkEntries[albumKey] || {
          status: "idle",
          coverUrl: null,
          error: null,
        };

        progress.total += 1;

        if (entry.status === "loaded" && entry.coverUrl) {
          progress.loaded += 1;
          return progress;
        }

        if (entry.status === "loading") {
          progress.loading += 1;
          return progress;
        }

        if (entry.status === "missing") {
          progress.missing += 1;
          return progress;
        }

        if (entry.error) {
          progress.failed += 1;
          return progress;
        }

        progress.pending += 1;
        return progress;
      },
      {
        total: 0,
        loaded: 0,
        loading: 0,
        failed: 0,
        missing: 0,
        pending: 0,
      }
    );
  }, [sortedCollectionRecords, artworkEntries]);

  const filterCounts = quickFilters.reduce((counts, filter) => {
    counts[filter.id] = searchMatchedRecords.filter((record) =>
      recordMatchesFilter(record, filter.id)
    ).length;
    return counts;
  }, {});

  const collectionStats = (() => {
    const artistCounts = new Map();
    const releaseYears = [];
    let favouriteCount = 0;
    let ratingTotal = 0;
    let ratingCount = 0;

    records.forEach((record) => {
      const albumKey = getAlbumKey(record);
      const savedDetails = savedAlbumDetails[albumKey] || {};
      const artist = record.Artist || "Unknown Artist";
      const releaseYear = Number(record.Released);

      artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);

      if (Number.isFinite(releaseYear) && releaseYear > 0) {
        releaseYears.push(releaseYear);
      }

      if (savedDetails.favorite) {
        favouriteCount += 1;
      }

      const numericRating = Number(savedDetails.rating);
      if (Number.isFinite(numericRating) && numericRating > 0) {
        ratingTotal += numericRating;
        ratingCount += 1;
      }
    });

    const mostCollectedArtist = Array.from(artistCounts.entries()).sort(
      (firstEntry, secondEntry) => secondEntry[1] - firstEntry[1]
    )[0]?.[0] || "N/A";

    const oldestReleaseYear = releaseYears.length ? Math.min(...releaseYears) : "N/A";
    const newestReleaseYear = releaseYears.length ? Math.max(...releaseYears) : "N/A";
    const averageRating = ratingCount ? (ratingTotal / ratingCount).toFixed(1) : "N/A";

    return {
      totalRecords: records.length,
      totalArtists: artistCounts.size,
      favouriteRecords: favouriteCount,
      averageRating,
      mostCollectedArtist,
      oldestReleaseYear,
      newestReleaseYear,
    };
  })();

  const collectionStatItems = [
    { icon: "📀", label: "Total Records", value: collectionStats.totalRecords },
    {
      icon: "📀",
      label: "Collection Size",
      value: collectionStats.totalRecords,
      detail: "Total Albums",
    },
    {
      icon: "🎤",
      label: "Artists",
      value: collectionStats.totalArtists,
      detail: "Total unique artists",
    },
    { icon: "❤️", label: "Favourite Records", value: collectionStats.favouriteRecords },
    {
      icon: "⭐",
      label: "Average Rating",
      value: collectionStats.averageRating,
      detail: "Rated albums only",
    },
    { icon: "🎤", label: "Most Collected Artist", value: collectionStats.mostCollectedArtist },
    { icon: "📅", label: "Oldest Release Year", value: collectionStats.oldestReleaseYear },
    { icon: "📅", label: "Newest Release Year", value: collectionStats.newestReleaseYear },
  ];

  function getCollectionValueStats(collection) {
    const placeholderAverageValue = "£18.00";
    const placeholderCollectionValue = `£${(collection.length * 18).toLocaleString()}`;

    return {
      estimatedCollectionValue: `${placeholderCollectionValue}*`,
      averageAlbumValue: `${placeholderAverageValue}*`,
      mostValuableAlbum: "Live Discogs data coming soon*",
    };
  }

  const collectionValueStats = getCollectionValueStats(records);
  const collectionValueItems = [
    {
      icon: "💷",
      label: "Estimated Collection Value",
      value: collectionValueStats.estimatedCollectionValue,
      note: "Placeholder until live marketplace values are connected",
    },
    {
      icon: "📀",
      label: "Average Album Value",
      value: collectionValueStats.averageAlbumValue,
      note: "Calculated from a temporary estimate model",
    },
    {
      icon: "💎",
      label: "Most Valuable Album",
      value: collectionValueStats.mostValuableAlbum,
      note: "Ready for live Discogs pricing later",
    },
  ];

  const todayAlbum = useMemo(() => {
    if (!records.length) {
      return null;
    }

    const today = new Date();
    const dateSeed = `${today.getUTCFullYear()}-${today.getUTCMonth() + 1}-${today.getUTCDate()}`;
    let hash = 0;

    for (let index = 0; index < dateSeed.length; index += 1) {
      hash = (hash << 5) - hash + dateSeed.charCodeAt(index);
      hash |= 0;
    }

    const albumIndex = Math.abs(hash) % records.length;
    return records[albumIndex];
  }, [records]);

  const favouriteRecords = records.filter((record) => {
    const savedDetails = savedAlbumDetails[getAlbumKey(record)] || {};
    return Boolean(savedDetails.favorite);
  });

  const topRatedRecords = records.filter((record) => {
    const savedDetails = savedAlbumDetails[getAlbumKey(record)] || {};
    return Number(savedDetails.rating) === 5;
  });

  const memoriesByArtist = useMemo(() => {
    const groupedMemories = new Map();

    records.forEach((record) => {
      const albumKey = getAlbumKey(record);
      const savedDetails = savedAlbumDetails[albumKey] || {};
      const memoryText = savedDetails.memory?.trim();

      if (!memoryText) {
        return;
      }

      const artist = record.Artist || "Unknown Artist";
      if (!groupedMemories.has(artist)) {
        groupedMemories.set(artist, []);
      }

      groupedMemories.get(artist).push({
        albumKey,
        recordKey: getRecordListKey(record),
        title: record.Title,
        released: record.Released,
        memory: memoryText,
        record,
      });
    });

    return Array.from(groupedMemories.entries())
      .map(([artist, entries]) => ({ artist, entries }))
      .sort((firstGroup, secondGroup) => firstGroup.artist.localeCompare(secondGroup.artist));
  }, [records, savedAlbumDetails]);

  function openArtistView(artistName) {
    if (!artistName) {
      return;
    }

    setSelectedAlbum(null);
    navigate(`/artists/${encodeURIComponent(artistName)}`);
  }

  function closeArtistView() {
    navigate("/artists");
  }

  async function surpriseMe() {
    if (!records.length) {
      return;
    }

    const randomRecord = records[Math.floor(Math.random() * records.length)];
    const albumKey = getAlbumKey(randomRecord);

    setSurpriseSelection({
      albumKey,
      token: Date.now(),
    });

    await openAlbum(randomRecord);
  }

  async function openAlbum(record) {
    const albumKey = getAlbumKey(record);
    const savedDetails = savedAlbumDetails[albumKey] || {};
    const artworkEntry = getArtworkEntry(record);
    const viewedAt = new Date().toISOString();
    const initialArtwork =
      customArtworkByAlbumKey[albumKey] || artworkEntry.coverUrl || record.cover || record.thumb || null;

    const historyState = window.history.state || {};
    if (!historyState.__mmAlbumModal) {
      window.history.pushState(
        {
          ...historyState,
          __mmAlbumModal: true,
        },
        ""
      );
    }

    setSelectedAlbum({
      ...mergeAlbumWithArtwork(record, savedDetails, artworkEntry),
      albumKey,
    });

    setRecentlyViewed((currentAlbums) => {
      const nextAlbums = [
        {
          albumKey,
          release_id: normalizeReleaseId(record.release_id || record.releaseId),
          artist: record.Artist || "Unknown Artist",
          album: record.Title || "Unknown Album",
          artwork: initialArtwork,
          viewedAt,
        },
        ...currentAlbums.filter((entry) => entry.albumKey !== albumKey),
      ].slice(0, RECENTLY_VIEWED_LIMIT);

      try {
        localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(nextAlbums));
      } catch {
        // Ignore storage failures and keep the in-memory state update.
      }

      return nextAlbums;
    });
  }

  async function openRecentlyViewedAlbum(recentEntry) {
    const matchingRecord = records.find((record) => getAlbumKey(record) === recentEntry.albumKey);

    if (matchingRecord) {
      await openAlbum(matchingRecord);
      return;
    }

    await openAlbum({
      albumKey: recentEntry.albumKey,
      release_id: normalizeReleaseId(recentEntry.release_id),
      Artist: recentEntry.artist || "Unknown Artist",
      Title: recentEntry.album || "Unknown Album",
      Released: "Unknown",
      cover: recentEntry.artwork || null,
      thumb: recentEntry.artwork || null,
    });
  }

  function saveAlbumDetails(details) {
    if (!details?.albumKey) {
      return;
    }

    setSavedAlbumDetails((currentDetails) => {
      const nextDetails = {
        ...currentDetails,
        [details.albumKey]: {
          memory: details.memory,
          favorite: details.favorite,
          rating: details.rating,
        },
      };

      try {
        localStorage.setItem(SAVED_MEMORIES_KEY, JSON.stringify(nextDetails));
      } catch {
        // Ignore storage failures and keep the in-memory state update.
      }

      return nextDetails;
    });

    setSelectedAlbum((currentAlbum) =>
      currentAlbum && currentAlbum.albumKey === details.albumKey
        ? {
            ...currentAlbum,
            memory: details.memory,
            favorite: details.favorite,
            rating: details.rating,
          }
        : currentAlbum
    );
  }

  function saveAlbumMetadata(details) {
    if (!details?.albumKey) {
      return;
    }

    setSavedAlbumDetails((currentDetails) => {
      const currentEntry = currentDetails[details.albumKey] || {};
      const nextDetails = {
        ...currentDetails,
        [details.albumKey]: {
          ...currentEntry,
          favorite: details.favorite,
          rating: details.rating,
        },
      };

      try {
        localStorage.setItem(SAVED_MEMORIES_KEY, JSON.stringify(nextDetails));
      } catch {
        // Ignore storage failures and keep the in-memory state update.
      }

      return nextDetails;
    });

    setSelectedAlbum((currentAlbum) =>
      currentAlbum && currentAlbum.albumKey === details.albumKey
        ? {
            ...currentAlbum,
            favorite: details.favorite,
            rating: details.rating,
          }
        : currentAlbum
    );
  }

  function closeAlbum() {
    if (window.history.state?.__mmAlbumModal) {
      window.history.back();
      return;
    }

    setSelectedAlbum(null);
  }

  function saveCustomArtwork(album, artworkDataUrl) {
    if (!album) {
      return;
    }

    const albumKey = getAlbumKey(album);
    if (!albumKey || !artworkDataUrl) {
      return;
    }

    setCustomArtworkByAlbumKey((currentEntries) => {
      const nextEntries = {
        ...currentEntries,
        [albumKey]: artworkDataUrl,
      };

      try {
        localStorage.setItem(CUSTOM_ARTWORK_KEY, JSON.stringify(nextEntries));
      } catch {
        // Ignore storage failures and keep in-memory custom artwork overrides.
      }

      return nextEntries;
    });

    setSelectedAlbum((currentAlbum) =>
      currentAlbum && getAlbumKey(currentAlbum) === albumKey
        ? {
            ...currentAlbum,
            cover: artworkDataUrl,
            thumb: artworkDataUrl,
          }
        : currentAlbum
    );
  }

  function clearCustomArtwork(album) {
    if (!album) {
      return;
    }

    const albumKey = getAlbumKey(album);
    if (!albumKey) {
      return;
    }

    setCustomArtworkByAlbumKey((currentEntries) => {
      if (!currentEntries[albumKey]) {
        return currentEntries;
      }

      const nextEntries = { ...currentEntries };
      delete nextEntries[albumKey];

      try {
        localStorage.setItem(CUSTOM_ARTWORK_KEY, JSON.stringify(nextEntries));
      } catch {
        // Ignore storage failures and keep in-memory custom artwork overrides.
      }

      return nextEntries;
    });
  }

  async function importRollingStoneListOnline() {
    setRollingStoneStatus("Fetching current Top 500 list...");

    try {
      const gistList = await fetchRollingStoneListFromGist();
      if (isLikelyTop500List(gistList)) {
        setRollingStoneList(gistList);
        localStorage.setItem(ROLLING_STONE_LIST_KEY, JSON.stringify(gistList));
        setRollingStoneStatus(`Imported ${gistList.length} entries from online list.`);
        return;
      }

      const pageName = "Rolling_Stone's_500_Greatest_Albums_of_All_Time";
      const endpoint = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(pageName)}&prop=text&formatversion=2&format=json&origin=*`;
      const response = await fetch(endpoint);

      if (!response.ok) {
        throw new Error(`Online import failed (${response.status}).`);
      }

      const data = await response.json();
      const htmlText = data?.parse?.text || "";

      if (!htmlText) {
        throw new Error("No list content found from online source.");
      }

      const parsedRows = parseRollingStoneFromWikipediaHtml(htmlText);
      const normalizedList = normalizeRollingStoneRows(parsedRows);

      if (!isLikelyTop500List(normalizedList)) {
        throw new Error(
          `Online source returned only ${normalizedList.length} usable rows. The full list is not publicly exposed on that page for auto-import.`
        );
      }

      setRollingStoneList(normalizedList);
      localStorage.setItem(ROLLING_STONE_LIST_KEY, JSON.stringify(normalizedList));
      setRollingStoneStatus(`Imported ${normalizedList.length} entries from current online list.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Online import failed.";
      setRollingStoneStatus(
        `${message} If you want, I can switch this to import from a specific public data URL you choose.`
      );
    }
  }

  function clearRollingStoneList() {
    setRollingStoneList([]);
    localStorage.removeItem(ROLLING_STONE_LIST_KEY);
    setRollingStoneStatus("Rolling Stone list cleared.");
  }

  function handleRecentlyPlayedArtistClick(event, artistName) {
    event.stopPropagation();
    openArtistView(artistName);
  }

  function clearRecentlyPlayed() {
    const shouldClear = window.confirm("Clear your Recently Played list?");

    if (!shouldClear) {
      return;
    }

    setRecentlyViewed([]);

    try {
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify([]));
    } catch {
      // Ignore storage failures and keep the in-memory state update.
    }
  }

  useEffect(() => {
    if (!surpriseSelection?.albumKey) {
      return;
    }

    const cardElement = document.getElementById(getAlbumCardId(surpriseSelection.albumKey));

    cardElement?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });

    const timeoutId = window.setTimeout(() => {
      setSurpriseSelection(null);
    }, 1400);

    return () => window.clearTimeout(timeoutId);
  }, [surpriseSelection]);

  useEffect(() => {
    const traceStore = getTraceStore();
    if (traceStore && !traceStore.__MM_TRACE_FIRST_ALBUM__ && filteredRecords.length) {
      const firstQueuedRecord = filteredRecords[0];
      traceStore.__MM_TRACE_FIRST_ALBUM__ = {
        albumKey: getAlbumKey(firstQueuedRecord),
        release_id: firstQueuedRecord.release_id || null,
      };

      console.log("[MM TRACE] 1.albumKey / 2.release_id", traceStore.__MM_TRACE_FIRST_ALBUM__);
    }
  }, [filteredRecords]);

  function renderAlbumGrid(recordList, hintText, highlightBySurprise = false) {
    if (!recordList.length) {
      return <p className="empty-state">No albums match this view yet.</p>;
    }

    return (
      <>
        <div className="results-row">
          <h2 className="results-row__title">{recordList.length} Records</h2>
          <p className="results-row__hint">{hintText}</p>
        </div>

        <ul className="collection-grid">
          {recordList.map((record) => {
            const albumKey = getAlbumKey(record);
            const savedDetails = savedAlbumDetails[albumKey] || {};

            return (
              <AlbumCard
                key={getRecordListKey(record)}
                record={record}
                onClick={openAlbum}
                onArtistClick={openArtistView}
                onVisible={handleAlbumCardVisible}
                id={getAlbumCardId(albumKey)}
                highlighted={highlightBySurprise && surpriseSelection?.albumKey === albumKey}
                favorite={savedDetails.favorite}
                rating={savedDetails.rating}
                cover={getArtworkEntry(record).coverUrl}
                artworkStatus={getArtworkEntry(record).status}
              />
            );
          })}
        </ul>
      </>
    );
  }

  function renderAlbumCrate(recordList, hintText, highlightBySurprise = false) {
    if (!recordList.length) {
      return <p className="empty-state">No albums match this view yet.</p>;
    }

    return (
      <>
        <div className="results-row">
          <h2 className="results-row__title">{recordList.length} Records</h2>
          <p className="results-row__hint">{hintText}</p>
        </div>

        <div className="collection-crate-shell">
          <div className="collection-crate-rim" aria-hidden="true" />
          <ul className="collection-crate" aria-label="Crate view albums">
            {recordList.map((record) => {
              const albumKey = getAlbumKey(record);
              const savedDetails = savedAlbumDetails[albumKey] || {};

              return (
                <AlbumCard
                  key={getRecordListKey(record)}
                  record={record}
                  onClick={openAlbum}
                  onArtistClick={openArtistView}
                  onVisible={handleAlbumCardVisible}
                  id={getAlbumCardId(albumKey)}
                  highlighted={highlightBySurprise && surpriseSelection?.albumKey === albumKey}
                  favorite={savedDetails.favorite}
                  rating={savedDetails.rating}
                  cover={getArtworkEntry(record).coverUrl}
                  artworkStatus={getArtworkEntry(record).status}
                />
              );
            })}
          </ul>
        </div>
      </>
    );
  }

  function renderRecentlyPlayedSection() {
    return (
      <section className="recently-played-panel glass-panel" aria-label="Recently played albums">
        <div className="recently-played-heading">
          <div className="section-heading">
            <p className="section-heading__eyebrow">Latest Spins</p>
            <h2 className="section-heading__title">🎵 Recently Played</h2>
          </div>

          <button
            type="button"
            className="recently-played-clear"
            onClick={clearRecentlyPlayed}
            disabled={!recentlyViewed.length}
          >
            Clear Recently Played
          </button>
        </div>

        {recentlyViewed.length ? (
          <ul className="recently-played-grid">
            {recentlyViewed.map((entry) => (
              <li key={entry.albumKey}>
                <article
                  role="button"
                  tabIndex={0}
                  className="recently-played-card"
                  onClick={() => openRecentlyViewedAlbum(entry)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      openRecentlyViewedAlbum(entry);
                    }
                  }}
                >
                  <div className="recently-played-card__art">
                    {entry.artwork ? (
                      <img
                        src={entry.artwork}
                        alt={`${entry.album || "Album"} artwork`}
                        className="recently-played-card__image"
                      />
                    ) : (
                      <div className="artwork-state artwork-state--placeholder" aria-label="No artwork available">
                        <span className="artwork-state__monogram">M&amp;M</span>
                        <span className="artwork-state__label">Music &amp; Memories</span>
                      </div>
                    )}
                  </div>

                  <div className="recently-played-card__body">
                    <p className="recently-played-card__artist">
                      <button
                        type="button"
                        className="artist-link-button"
                        onClick={(event) => handleRecentlyPlayedArtistClick(event, entry.artist)}
                      >
                        {entry.artist || "Unknown Artist"}
                      </button>
                    </p>
                    <p className="recently-played-card__album">{entry.album || "Unknown Album"}</p>
                    <p className="recently-played-card__time">{formatViewedDateTime(entry.viewedAt)}</p>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        ) : (
          <p className="recently-played-empty">Open any album to start your Recently Played list.</p>
        )}
      </section>
    );
  }

  function HomePage() {
    const latestArrivalAlbums = useMemo(() => {
      return [...records]
        .map((record, index) => {
          const dateAddedRaw = record["Date Added"] || record.dateAdded || record.DateAdded || "";
          const albumKey = getAlbumKey(record);

          return {
            artist: record.Artist || "Unknown Artist",
            title: record.Title || "Unknown Album",
            year: record.Released || "Unknown",
            release_id: normalizeReleaseId(record.release_id || record.releaseId),
            record,
            __sortValue: dateAddedRaw ? new Date(dateAddedRaw).getTime() : 0,
          };
        })
        .sort((firstAlbum, secondAlbum) => secondAlbum.__sortValue - firstAlbum.__sortValue)
        .slice(0, 10)
        .map(({ __sortValue, ...album }) => album);
    }, [records]);

    const tonightRecord = useMemo(() => {
      if (!records.length) {
        return null;
      }

      return records[Math.floor(Math.random() * records.length)];
    }, [records]);

    const tonightAlbum = tonightRecord
      ? {
          artist: tonightRecord.Artist || "Unknown Artist",
          title: tonightRecord.Title || "Unknown Album",
          year: tonightRecord.Released || "Unknown",
          release_id: normalizeReleaseId(tonightRecord.release_id || tonightRecord.releaseId),
          record: tonightRecord,
        }
      : null;

    const continueListeningAlbums = useMemo(() => {
      return recentlyViewed.map((entry) => {
        const matchingRecord = records.find((record) => getAlbumKey(record) === entry.albumKey);
        const releaseId = normalizeReleaseId(
          matchingRecord?.release_id || matchingRecord?.releaseId || entry.release_id
        );

        return {
          albumKey: entry.albumKey,
          artist: matchingRecord?.Artist || entry.artist || "Unknown Artist",
          title: matchingRecord?.Title || entry.album || "Unknown Album",
          year: matchingRecord?.Released || "Unknown",
          release_id: releaseId,
          record:
            matchingRecord || {
              albumKey: entry.albumKey,
              release_id: releaseId,
              Artist: entry.artist || "Unknown Artist",
              Title: entry.album || "Unknown Album",
              Released: "Unknown",
              cover: entry.artwork || null,
              thumb: entry.artwork || null,
            },
        };
      });
    }, [recentlyViewed, records]);

    const trackCount = records.reduce(
      (total, record) => total + Number(record.tracks || record.trackCount || record["Track Count"] || 0),
      0
    );
    const memoryCount = Object.values(savedAlbumDetails).filter((entry) => entry?.memory?.trim()).length;
    const uniqueYears = Array.from(
      new Set(
        records
          .map((record) => Number(record.Released))
          .filter((year) => Number.isFinite(year) && year > 0)
      )
    ).sort((firstYear, secondYear) => firstYear - secondYear);
    const dashboardStats = [
      { label: "Albums", value: records.length || 0, hint: "Curated sleeves" },
      { label: "Artists", value: collectionStats.totalArtists, hint: "Across the archive" },
      { label: "Tracks", value: trackCount || "N/A", hint: "When metadata is available" },
      { label: "Years", value: uniqueYears.length || 0, hint: "Distinct release years" },
      { label: "Memories", value: memoryCount, hint: "Stories saved" },
    ];
    const memoryEntries = memoriesByArtist.flatMap((group) => group.entries);
    const randomMemoryEntry = useMemo(() => {
      if (!memoryEntries.length) {
        return null;
      }

      return memoryEntries[Math.floor(Math.random() * memoryEntries.length)];
    }, [memoryEntries]);
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const tonightSavedDetails = tonightRecord ? getSavedAlbum(tonightRecord) : {};

    function handleLatestArrivalSelect(album) {
      if (album?.record) {
        openAlbum(album.record);
      }
    }

    function handleOpenYouTubeMusic(record) {
      const search = `${record?.Artist || ""} ${record?.Title || ""}`.trim();
      const encodedSearch = encodeURIComponent(search);
      window.open(`https://music.youtube.com/search?q=${encodedSearch}`, "_blank", "noopener,noreferrer");
    }

    function handleToggleTonightFavorite(record) {
      const albumKey = getAlbumKey(record);
      const savedDetails = getSavedAlbum(record);

      saveAlbumMetadata({
        ...record,
        albumKey,
        favorite: !savedDetails.favorite,
        rating: savedDetails.rating || 0,
      });
    }

    return (
      <DashboardLayout
        hero={
          <HeroSection
            greeting={greeting}
            name="Music and Memories"
            subtitle="Pick your next spin."
            extra={<HomeTrackSearch onOpenAlbum={openAlbum} />}
          />
        }
        stats={<CollectionStats items={dashboardStats} />}
        continueListening={
          <ContinueListening
            albums={continueListeningAlbums}
            onSelect={openAlbum}
            onArtistClick={openArtistView}
          />
        }
        recentlyAdded={<RecentlyAdded albums={latestArrivalAlbums} onSelect={handleLatestArrivalSelect} />}
        tonightsPick={
          <TonightsPick
            album={tonightAlbum}
            isFavorite={Boolean(tonightSavedDetails.favorite)}
            onOpenAlbum={openAlbum}
            onOpenYouTubeMusic={handleOpenYouTubeMusic}
            onToggleFavorite={handleToggleTonightFavorite}
          />
        }
        randomMemory={
          <RandomMemory
            memoryEntry={randomMemoryEntry}
            onOpenAlbum={openAlbum}
            onArtistClick={openArtistView}
          />
        }
        bottomPlayer={<BottomPlayer album={tonightAlbum} onOpenYouTubeMusic={handleOpenYouTubeMusic} />}
      />
    );
  }

  function renderCollectionPage() {
    return (
      <>
        <div className="app-toolbar app-toolbar--search">
          <input
            type="text"
            placeholder="🔍 Search your collection..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="collection-search"
          />

          <select
            value={collectionSort}
            onChange={(event) => setCollectionSort(event.target.value)}
            className="collection-sort"
            aria-label="Sort collection"
          >
            <option value="artist-asc">Artist (A–Z)</option>
            <option value="artist-desc">Artist (Z–A)</option>
            <option value="album-asc">Album (A–Z)</option>
            <option value="album-desc">Album (Z–A)</option>
            <option value="year-newest">Year (Newest)</option>
            <option value="year-oldest">Year (Oldest)</option>
          </select>

          <div className="collection-view-toggle" role="tablist" aria-label="Collection view mode">
            <button
              type="button"
              role="tab"
              aria-selected={collectionView === "grid"}
              className={`collection-view-toggle__button${collectionView === "grid" ? " is-active" : ""}`}
              onClick={() => setCollectionView("grid")}
            >
              Grid
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={collectionView === "crate"}
              className={`collection-view-toggle__button${collectionView === "crate" ? " is-active" : ""}`}
              onClick={() => setCollectionView("crate")}
            >
              Crate
            </button>
          </div>
        </div>

        <div className="filter-bar" role="toolbar" aria-label="Quick collection filters">
          {quickFilters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              className={`filter-chip${activeFilter === filter.id ? " is-active" : ""}`}
              onClick={() => setActiveFilter(filter.id)}
            >
              <span className="filter-chip__label">{filter.label}</span>
              <span className="filter-chip__count">{filterCounts[filter.id] || 0}</span>
            </button>
          ))}
        </div>

        <div className="alphabet-filter-bar" role="toolbar" aria-label="Filter by artist initial">
          {LETTER_FILTERS.map((letter) => (
            <button
              key={letter}
              type="button"
              className={`alphabet-filter-chip${collectionLetter === letter ? " is-active" : ""}`}
              onClick={() => setCollectionLetter(letter)}
            >
              {letter}
            </button>
          ))}
        </div>

        <p className="collection-artwork-progress" aria-live="polite">
          {collectionFilterLabel}: {collectionArtworkProgress.loaded}/{collectionArtworkProgress.total} loaded • {collectionArtworkProgress.loading} loading • {collectionArtworkProgress.pending} pending • {collectionArtworkProgress.failed} failed • {collectionArtworkProgress.missing} no artwork
        </p>

        {message && <p className="status-message">{message}</p>}
        <div className="collection-page-compact">
          {collectionView === "crate"
            ? renderAlbumCrate(sortedCollectionRecords, "Vinyl crate view", true)
            : renderAlbumGrid(sortedCollectionRecords, "Premium dark glass collection view", true)}
        </div>
      </>
    );
  }

  function FavouritesPage() {
    return (
      <section className="page-section">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Curated</p>
          <h2 className="section-heading__title">❤️ Favourite Albums</h2>
        </div>
        {renderAlbumGrid(favouriteRecords, "Albums marked as favourites")}
      </section>
    );
  }

  function TopRatedPage() {
    const collectionByArtistAlbum = useMemo(() => {
      const lookup = new Map();

      records.forEach((record) => {
        const artist = normalizeMatchText(record.Artist);
        const album = normalizeMatchText(record.Title);

        if (!artist || !album) {
          return;
        }

        lookup.set(`${artist}|||${album}`, record);
      });

      return lookup;
    }, [records]);

    const rollingStoneRows = useMemo(() => {
      return rollingStoneList
        .map((entry, index) => {
          const key = `${normalizeMatchText(entry.artist)}|||${normalizeMatchText(entry.album)}`;
          const ownedRecord = collectionByArtistAlbum.get(key) || null;
          const rankValue = Number.parseInt(entry.rank, 10);
          const rank = Number.isFinite(rankValue) ? rankValue : index + 1;

          return {
            ...entry,
            rank,
            ownedRecord,
          };
        })
        .sort((firstEntry, secondEntry) => firstEntry.rank - secondEntry.rank);
    }, [rollingStoneList, collectionByArtistAlbum]);

    const ownedCount = rollingStoneRows.filter((entry) => Boolean(entry.ownedRecord)).length;

    return (
      <section className="page-section">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Best Rated</p>
          <h2 className="section-heading__title">⭐ Top Rated Albums</h2>
        </div>
        {renderAlbumGrid(topRatedRecords, "Albums rated 5 stars")}

        <section className="rolling-stone-panel glass-panel" aria-label="Rolling Stone Top 500 tracker">
          <div className="rolling-stone-panel__header">
            <div>
              <p className="section-heading__eyebrow">Collection Tracker</p>
              <h3 className="rolling-stone-panel__title">Rolling Stone Top 500</h3>
              <p className="rolling-stone-panel__meta">
                {rollingStoneRows.length ? `${ownedCount}/${rollingStoneRows.length} owned` : "Import your list to start tracking"}
              </p>
            </div>

            <div className="rolling-stone-panel__actions">
              {!rollingStoneRows.length ? (
                <button type="button" className="collection-button" onClick={importRollingStoneListOnline}>
                  Import Current Top 500 Online
                </button>
              ) : null}
              {rollingStoneRows.length ? (
                <button type="button" className="surprise-button" onClick={clearRollingStoneList}>
                  Clear List
                </button>
              ) : null}
            </div>
          </div>

          <p className="rolling-stone-panel__hint">
            Pulls the current public Top 500 list online, then marks what you own.
          </p>

          {rollingStoneStatus ? <p className="status-message">{rollingStoneStatus}</p> : null}

          {rollingStoneRows.length ? (
            <ul className="rolling-stone-panel__list">
              {rollingStoneRows.map((entry) => (
                <li key={`${entry.rank}-${entry.artist}-${entry.album}`} className="rolling-stone-panel__item">
                  <p className="rolling-stone-panel__rank">#{entry.rank}</p>
                  <div className="rolling-stone-panel__copy">
                    <p className="rolling-stone-panel__album">{entry.album}</p>
                    <p className="rolling-stone-panel__artist">{entry.artist}</p>
                  </div>
                  <div className="rolling-stone-panel__state">
                    {entry.ownedRecord ? (
                      <>
                        <span className="rolling-stone-panel__owned" aria-label="Owned">
                          ✓
                        </span>
                        <button
                          type="button"
                          className="collection-button"
                          onClick={() => openAlbum(entry.ownedRecord)}
                        >
                          Open
                        </button>
                      </>
                    ) : (
                      <span className="rolling-stone-panel__missing" aria-label="Missing">
                        ○
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </section>
    );
  }

  function MemoriesPage() {
    return (
      <section className="memories-page" aria-label="Saved memories by artist">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Reflections</p>
          <h2 className="section-heading__title">📝 Memories by Artist</h2>
        </div>

        {memoriesByArtist.length ? (
          <div className="memories-groups">
            {memoriesByArtist.map((group) => (
              <article key={group.artist} className="glass-panel memories-group">
                <h3 className="memories-group__artist">
                  <button type="button" className="artist-link-button" onClick={() => openArtistView(group.artist)}>
                    {group.artist}
                  </button>
                </h3>

                <ul className="memories-group__list">
                  {group.entries.map((entry) => (
                    <li key={entry.recordKey} className="memories-group__item">
                      <button
                        type="button"
                        className="memories-group__album"
                        onClick={() => openAlbum(entry.record)}
                      >
                        {entry.title} {entry.released ? `(${entry.released})` : ""}
                      </button>
                      <p className="memories-group__text">{entry.memory}</p>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No memories saved yet. Add memories from any album popup.</p>
        )}
      </section>
    );
  }

  function ArtistsRoute() {
    const params = useParams();
    const selectedArtist = params.artistName ? decodeURIComponent(params.artistName) : "";

    if (selectedArtist) {
      return (
        <ArtistCollectionView
          artistName={selectedArtist}
          records={records}
          savedAlbumDetails={savedAlbumDetails}
          getAlbumKey={getAlbumKey}
          getRecordListKey={getRecordListKey}
          getArtworkEntry={getArtworkEntry}
          onAlbumVisible={handleAlbumCardVisible}
          onAlbumOpen={openAlbum}
          onBack={closeArtistView}
          onArtistClick={openArtistView}
        />
      );
    }

    return <ArtistsDirectoryView records={records} onArtistClick={openArtistView} />;
  }

  function DuplicatesPage() {
    return <DuplicateDetectorPage records={records} onOpenAlbum={openAlbum} />;
  }

  return (
    <div className="app-shell">
      <div className="app-layout">
        <aside className="app-nav app-nav--desktop" aria-label="Main navigation">
          <div className="glass-panel app-nav__panel">
            <h2 className="app-nav__title">Navigate</h2>
            <ul className="app-nav__list">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) => `app-nav__button${isActive ? " is-active" : ""}`}
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="app-shell__inner">
          <header className="app-hero">
            <p className="app-kicker">Music & Memories</p>
            <h1 className="app-title">
              <img src={mmMonogramLogo} alt="M&amp;M" className="app-title__logo" />
              <span>Music &amp; Memories</span>
            </h1>
            <p className="app-tagline">Every record has a story.</p>
          </header>

          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={<HomePage />} />
            <Route path="/collection" element={renderCollectionPage()} />
            <Route path="/add-music" element={<AddMusicPage onAddRecord={addRecordToCollection} />} />
            <Route path="/artists" element={<ArtistsRoute />} />
            <Route path="/artists/:artistName" element={<ArtistsRoute />} />
            <Route path="/duplicates" element={<DuplicatesPage />} />
            <Route path="/favourites" element={<FavouritesPage />} />
            <Route path="/top-rated" element={<TopRatedPage />} />
            <Route
              path="/insights"
              element={
                <PlaceholderPage
                  title="📊 Insights"
                  eyebrow="Coming Soon"
                  description="Expanded collection statistics and visual analytics will be available in a future release."
                />
              }
            />
            <Route path="/memories" element={<MemoriesPage />} />
            <Route
              path="/settings"
              element={
                <PlaceholderPage
                  title="⚙ Settings"
                  eyebrow="Coming Soon"
                  description="Application settings and personalization controls are prepared for upcoming builds."
                />
              }
            />
          </Routes>

          <nav className="app-nav app-nav--mobile" aria-label="Bottom navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `app-nav__button app-nav__button--mobile${isActive ? " is-active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <AlbumModal
            album={selectedAlbum}
            onClose={closeAlbum}
            onSave={saveAlbumDetails}
            onMetadataChange={saveAlbumMetadata}
            onArtistClick={openArtistView}
            onCustomArtworkUpload={saveCustomArtwork}
            onCustomArtworkRemove={clearCustomArtwork}
            hasCustomArtwork={Boolean(selectedAlbum && customArtworkByAlbumKey[selectedAlbum.albumKey])}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
