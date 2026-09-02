import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import Papa from "papaparse";
import { getArtworkForContext, getRelease, searchDiscogsReleases } from "./services/discogs";
import artworkManager from "./services/artworkManager";
import AlbumCard from "./components/AlbumCard";
import AddMusicPage from "./components/AddMusicPage";
import AlbumModal from "./components/AlbumModal";
import ArtistCollectionView from "./components/ArtistCollectionView";
import ArtistsDirectoryView from "./components/ArtistsDirectoryView";
import BottomPlayer from "./components/dashboard/BottomPlayer";
import CollectionStats from "./components/dashboard/CollectionStats";
import CollectionInsightsView from "./components/CollectionInsightsView";
import ContinueListening from "./components/dashboard/ContinueListening";
import DashboardLayout from "./components/dashboard/DashboardLayout";
import DuplicateDetectorPage from "./components/DuplicateDetectorPage";
import HeroSection from "./components/dashboard/HeroSection";
import HomeTrackSearch from "./components/dashboard/HomeTrackSearch";
import RandomMemory from "./components/dashboard/RandomMemory";
import RecentlyAdded from "./components/dashboard/RecentlyAdded";
import SettingsPage from "./components/SettingsPage";
import TonightsPick from "./components/dashboard/TonightsPick";
import PlaceholderPage from "./components/PlaceholderPage";
import {
  loadLocalTrackIndex,
  mergeTrackIndexes,
  normalizeTrackIndexEntries,
  saveLocalTrackIndex,
  upsertTrackIndexEntry,
} from "./services/trackIndex";
import mmMonogramLogo from "./assets/mm-monogram-logo.svg";
import "./App.css";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/static-components, react-hooks/preserve-manual-memoization */

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
const PLAYED_ALBUMS_KEY = "the-memory-box:played-albums";
const PLAYED_TRACKS_KEY = "the-memory-box:played-tracks";
const ADDED_RECORDS_KEY = "the-memory-box:added-records";
const CUSTOM_ARTWORK_KEY = "the-memory-box:custom-artwork";
const ROLLING_STONE_LIST_KEY = "the-memory-box:rolling-stone-top-500";
const MANUAL_COLLECTION_WORTH_KEY = "the-memory-box:manual-collection-worth";
const WORTH_BY_RELEASE_KEY = "the-memory-box:worth-by-release";
const WORTH_AUTO_FULL_REPRICE_KEY = "the-memory-box:worth-auto-full-reprice";
const ROLLING_STONE_GIST_API = "https://api.github.com/gists/232302a4ba29fd8f5f0d0352ef55d2b9";
const COLLECTION_TRACK_INDEX_URL = "/collection-track-index.json";
const RECENTLY_VIEWED_LIMIT = 10;
const WORTH_REFRESH_BATCH_SIZE = 12;
const WORTH_REFRESH_INTERVAL_MS = 3 * 60 * 1000;
const WORTH_STALE_MS = 24 * 60 * 60 * 1000;
const LETTER_FILTERS = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0-9", "ALL"];
const PERSISTENT_CACHE_PREFIXES = ["release-details:", "artwork-v2:url:"];
const ARTWORK_DB_NAME = "music-and-memories-artwork-cache";
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

function normalizeManualCollectionWorth(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const currency = String(value.currency || "GBP").toUpperCase();
  const source = String(value.source || "discogs").toLowerCase();

  return {
    amount,
    currency,
    source,
  };
}

function normalizeWorthByRelease(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([releaseId, entry]) => {
        if (!releaseId || !entry || typeof entry !== "object") {
          return null;
        }

        const amount = Number(entry.value);
        const updatedAt = Number(entry.updatedAt) || 0;

        return [
          String(releaseId),
          {
            value: Number.isFinite(amount) && amount > 0 ? amount : null,
            currency: String(entry.currency || "USD").toUpperCase(),
            updatedAt,
          },
        ];
      })
      .filter(Boolean)
  );
}

function formatLastUpdatedLabel(timestamp) {
  if (!timestamp) {
    return "just now";
  }

  const deltaMs = Date.now() - Number(timestamp);
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) {
    return "just now";
  }

  const minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function normalizeRecentlyViewedEntries(storedValue) {
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

function loadRecentlyViewed() {
  return normalizeRecentlyViewedEntries(loadStoredJson(RECENTLY_VIEWED_KEY, []));
}

function normalizePlayedKeys(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean)));
}

function normalizeAddedRecords(storedValue) {
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

function loadAddedRecords() {
  return normalizeAddedRecords(loadStoredJson(ADDED_RECORDS_KEY, []));
}

function normalizeRollingStoneEntries(storedValue) {
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
        release_id: normalizeReleaseId(entry.release_id || entry.releaseId),
        thumb: entry.thumb || entry.cover || null,
        cover: entry.cover || entry.thumb || null,
      };
    })
    .filter(Boolean);
}

function getRollingStoneEntryKey(entry) {
  return `${String(entry.rank || "")}|||${String(entry.artist || "").trim()}|||${String(entry.album || "").trim()}`;
}

function loadRollingStoneList() {
  return normalizeRollingStoneEntries(loadStoredJson(ROLLING_STONE_LIST_KEY, []));
}

function clearPersistentCacheEntries() {
  if (typeof localStorage !== "undefined") {
    try {
      const keysToRemove = [];

      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);

        if (key && PERSISTENT_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch {
      // Ignore storage failures and continue with the reload.
    }
  }

  if (typeof indexedDB !== "undefined") {
    try {
      indexedDB.deleteDatabase(ARTWORK_DB_NAME);
    } catch {
      // Ignore IndexedDB cleanup failures and continue with the reload.
    }
  }
}

function normalizeSavedAlbumDetails(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([albumKey, entry]) => albumKey && entry && typeof entry === "object")
      .map(([albumKey, entry]) => [
        albumKey,
        {
          memory: typeof entry.memory === "string" ? entry.memory : "",
          trackMemories: entry.trackMemories && typeof entry.trackMemories === "object" && !Array.isArray(entry.trackMemories)
            ? Object.fromEntries(
                Object.entries(entry.trackMemories)
                  .filter(([trackKey, trackMemory]) => trackKey && typeof trackMemory === "string" && trackMemory.trim())
              )
            : {},
          favorite: Boolean(entry.favorite),
          rating: Number(entry.rating) || 0,
          artist: typeof entry.artist === "string" ? entry.artist : "",
          title: typeof entry.title === "string" ? entry.title : "",
          released: entry.released || "",
          release_id: normalizeReleaseId(entry.release_id || entry.releaseId),
        },
      ])
  );
}

function normalizeCustomArtworkEntries(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(([albumKey, artworkUrl]) => albumKey && typeof artworkUrl === "string" && artworkUrl)
  );
}

function normalizeMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseAlbumKeyFallback(albumKey) {
  const rawKey = String(albumKey || "").trim();
  if (!rawKey) {
    return {
      artist: "Unknown Artist",
      title: "Unknown Album",
      released: "",
    };
  }

  const keyParts = rawKey.split("-");
  if (keyParts.length >= 3) {
    const released = keyParts[keyParts.length - 1];
    const title = keyParts[keyParts.length - 2];
    const artist = keyParts.slice(0, -2).join("-");

    return {
      artist: artist || "Unknown Artist",
      title: title || "Unknown Album",
      released: released || "",
    };
  }

  return {
    artist: "Unknown Artist",
    title: rawKey || "Unknown Album",
    released: "",
  };
}

function formatCurrencyAmount(amount, currencyCode = "USD") {
  if (!Number.isFinite(amount)) {
    return "N/A";
  }

  const normalizedCurrency = String(currencyCode || "USD").toUpperCase();
  const numericAmount = Math.round(amount);

  if (normalizedCurrency === "GBP" || normalizedCurrency === "EUR") {
    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: normalizedCurrency === "EUR" ? "EUR" : "GBP",
        maximumFractionDigits: 0,
      }).format(numericAmount);
    } catch {
      return `${normalizedCurrency === "EUR" ? "€" : "£"}${numericAmount.toLocaleString("en-GB")}`;
    }
  }

  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: normalizedCurrency || "USD",
      maximumFractionDigits: 0,
    }).format(numericAmount);
  } catch {
    return `${normalizedCurrency || "USD"} ${numericAmount.toLocaleString()}`;
  }
}

function convertToGbp(amount, currencyCode = "USD") {
  if (!Number.isFinite(amount)) {
    return null;
  }

  const normalizedCurrency = String(currencyCode || "USD").toUpperCase();

  if (normalizedCurrency === "GBP") {
    return amount;
  }

  if (normalizedCurrency === "USD") {
    return amount * 0.78;
  }

  if (normalizedCurrency === "EUR") {
    return amount * 0.86;
  }

  return amount;
}

function formatWorthInGbp(amount, currencyCode = "USD") {
  const amountInGbp = convertToGbp(amount, currencyCode);

  if (!Number.isFinite(amountInGbp)) {
    return "N/A";
  }

  return formatCurrencyAmount(amountInGbp, "GBP");
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
        release_id: normalizeReleaseId(entry.release_id || entry.releaseId),
        thumb: entry.thumb || entry.cover || null,
        cover: entry.cover || entry.thumb || null,
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

function hashString(value) {
  const text = String(value || "");
  let hash = 0;

  for (let index = 0; index < text.length; index += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function pickStableRecord(records, seedValue = "") {
  if (!records.length) {
    return null;
  }

  const index = hashString(seedValue) % records.length;
  return records[index] || null;
}

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const refreshCounterRef = useRef(0);
  const worthRefreshInFlightRef = useRef(false);
  const [baseRecords, setBaseRecords] = useState([]);
  const [addedRecords, setAddedRecords] = useState(() => loadAddedRecords());
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [savedAlbumDetails, setSavedAlbumDetails] = useState(() =>
    normalizeSavedAlbumDetails(loadSavedMemories())
  );
  const [surpriseSelection, setSurpriseSelection] = useState(null);
  const [activeFilter, setActiveFilter] = useState("all");
  const [collectionSort, setCollectionSort] = useState("artist-asc");
  const [collectionLetter, setCollectionLetter] = useState("A");
  const [recentlyViewed, setRecentlyViewed] = useState(() => loadRecentlyViewed());
  const [playedAlbumKeys, setPlayedAlbumKeys] = useState(() =>
    normalizePlayedKeys(loadStoredJson(PLAYED_ALBUMS_KEY, []))
  );
  const [playedTrackKeys, setPlayedTrackKeys] = useState(() =>
    normalizePlayedKeys(loadStoredJson(PLAYED_TRACKS_KEY, []))
  );
  const [artworkEntries, setArtworkEntries] = useState(() => artworkManager.getSnapshot());
  const [customArtworkByAlbumKey, setCustomArtworkByAlbumKey] = useState(() =>
    loadStoredJson(CUSTOM_ARTWORK_KEY, {})
  );
  const [rollingStoneList, setRollingStoneList] = useState(() => loadRollingStoneList());
  const [rollingStoneStatus, setRollingStoneStatus] = useState("");
  const [baseTrackIndex, setBaseTrackIndex] = useState([]);
  const [localTrackIndex, setLocalTrackIndex] = useState(() => loadLocalTrackIndex());
  const [collectionWorthEstimate, setCollectionWorthEstimate] = useState({
    total: 0,
    sampled: 0,
    sampleSize: 0,
    currency: "USD",
  });
  const [worthRankedAlbums, setWorthRankedAlbums] = useState([]);
  const [worthDetailsOpen, setWorthDetailsOpen] = useState(false);
  const [worthLoading, setWorthLoading] = useState(false);
  const [worthRefreshProgress, setWorthRefreshProgress] = useState({
    active: false,
    processed: 0,
    total: 0,
    mode: "batch",
  });
  const [worthAutoFullReprice, setWorthAutoFullReprice] = useState(() =>
    Boolean(loadStoredJson(WORTH_AUTO_FULL_REPRICE_KEY, false))
  );
  const [worthByRelease, setWorthByRelease] = useState(() =>
    normalizeWorthByRelease(loadStoredJson(WORTH_BY_RELEASE_KEY, {}))
  );
  const [worthLastUpdatedAt, setWorthLastUpdatedAt] = useState(0);
  const worthByReleaseRef = useRef(worthByRelease);
  const [manualCollectionWorth, setManualCollectionWorth] = useState(() =>
    normalizeManualCollectionWorth(loadStoredJson(MANUAL_COLLECTION_WORTH_KEY, null))
  );
  const [tonightPickShuffleSeed, setTonightPickShuffleSeed] = useState(0);
  const records = useMemo(() => [...addedRecords, ...baseRecords], [addedRecords, baseRecords]);
  const trackIndex = useMemo(
    () => mergeTrackIndexes(baseTrackIndex, localTrackIndex),
    [baseTrackIndex, localTrackIndex]
  );
  const recentlyViewedAlbumKeys = recentlyViewed.map((entry) => entry.albumKey);
  const playedAlbumKeySet = useMemo(() => new Set(playedAlbumKeys), [playedAlbumKeys]);

  useEffect(() => {
    worthByReleaseRef.current = worthByRelease;
  }, [worthByRelease]);

  useEffect(() => {
    function handlePopState() {
      setSelectedAlbum((currentAlbum) => (currentAlbum ? null : currentAlbum));
    }

    const originalPushState = window.history.pushState.bind(window.history);
    const originalReplaceState = window.history.replaceState.bind(window.history);

    window.history.pushState = (state, title, url) => {
      const isModalState = Boolean(state && typeof state === "object" && state.__mmAlbumModal);
      if (!isModalState) {
        setSelectedAlbum(null);
      }

      return originalPushState(state, title, url);
    };

    window.history.replaceState = (state, title, url) => {
      const isModalState = Boolean(state && typeof state === "object" && state.__mmAlbumModal);
      if (!isModalState) {
        setSelectedAlbum(null);
      }

      return originalReplaceState(state, title, url);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.history.pushState = originalPushState;
      window.history.replaceState = originalReplaceState;
    };
  }, []);

  useEffect(() => {
    // Clear the active modal whenever the URL path changes.
    setSelectedAlbum(null);
  }, [location.pathname]);

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

  useEffect(() => {
    let isCanceled = false;

    async function loadBaseTrackIndex() {
      try {
        const response = await fetch(COLLECTION_TRACK_INDEX_URL, { cache: "no-cache" });
        if (!response.ok) {
          return;
        }

        const nextTrackIndex = normalizeTrackIndexEntries(await response.json());
        if (!isCanceled) {
          setBaseTrackIndex(nextTrackIndex);
        }
      } catch {
        if (!isCanceled) {
          setBaseTrackIndex([]);
        }
      }
    }

    void loadBaseTrackIndex();

    return () => {
      isCanceled = true;
    };
  }, []);

  function saveAlbumTrackIndex(record, tracks) {
    if (!record || !Array.isArray(tracks) || !tracks.length) {
      return;
    }

    setLocalTrackIndex((currentIndex) => upsertTrackIndexEntry(currentIndex, record, tracks));
  }

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
    };

    const recordKey = getAlbumKey(nextRecord);
    nextRecord.__rowIndex = `added-${recordKey}`;

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

    if (Array.isArray(record.tracks) && record.tracks.length) {
      saveAlbumTrackIndex(nextRecord, record.tracks);
    }

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
    const embeddedArtworkUrl = record.cover || record.thumb || null;

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

    if (entry.status === "idle" && !entry.coverUrl && embeddedArtworkUrl) {
      return {
        ...entry,
        status: "loaded",
        coverUrl: embeddedArtworkUrl,
      };
    }

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

    // Skip network work when artwork already exists in the base record payload.
    if (record.cover || record.thumb || customArtworkByAlbumKey[albumKey]) {
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
      cover: artworkEntry.coverUrl || record.cover || record.thumb || null,
      artworkStatus: artworkEntry.status,
      year: artworkEntry.releaseData?.year || record.Released,
      label: artworkEntry.releaseData?.label || record.Label || "",
      genres: artworkEntry.releaseData?.genres || record.genres || "",
      tracks: [artworkEntry.releaseData?.tracks, record.tracks].find(
        (candidateTracks) => Array.isArray(candidateTracks) && candidateTracks.length > 0
      ) || [],
    };
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

  const notListenedAlbumKeySet = useMemo(() => {
    const listenedAlbumKeySet = new Set(recentlyViewedAlbumKeys);

    return new Set(
      records
        .map((record) => getAlbumKey(record))
        .filter((albumKey) => !listenedAlbumKeySet.has(albumKey))
    );
  }, [records, recentlyViewedAlbumKeys]);

  const notListenedPreviewAlbumKeySet = useMemo(() => {
    const listenedAlbumKeySet = new Set(recentlyViewedAlbumKeys);

    const unplayedByNewestAdded = [...records]
      .filter((record) => !listenedAlbumKeySet.has(getAlbumKey(record)))
      .map((record) => {
        const dateAddedRaw = record["Date Added"] || record.dateAdded || record.DateAdded || "";
        const sortValue = dateAddedRaw ? new Date(dateAddedRaw).getTime() : 0;

        return {
          albumKey: getAlbumKey(record),
          sortValue,
        };
      })
      .sort((firstItem, secondItem) => secondItem.sortValue - firstItem.sortValue)
      .slice(0, 5);

    return new Set(unplayedByNewestAdded.map((item) => item.albumKey));
  }, [records, recentlyViewedAlbumKeys]);

  const quickFilters = [
    { id: "all", label: "All Records" },
    { id: "unplayed", label: "🔕 Not Listened" },
    { id: "unplayed5", label: "🖐 Not Listened (5)" },
    { id: "favorites", label: "❤️ Favourites" },
    { id: "rated5", label: "⭐ Top Rated" },
    { id: "memories", label: "📝 Has Memories" },
    { id: "1970s", label: "📅 1970s" },
    { id: "1980s", label: "📅 1980s" },
    { id: "1990s", label: "📅 1990s" },
    { id: "2000plus", label: "📅 2000+" },
    { id: "recent", label: "🎲 Recently Viewed" },
    { id: "played", label: "▶ Played" },
  ];

  function recordMatchesFilter(record, filterId) {
    const savedAlbum = getSavedAlbum(record);
    const releaseYear = getReleaseYear(record);
    const albumKey = getAlbumKey(record);

    switch (filterId) {
      case "unplayed":
        return notListenedAlbumKeySet.has(albumKey);
      case "unplayed5":
        return notListenedPreviewAlbumKeySet.has(albumKey);
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
      case "played":
        return playedAlbumKeySet.has(albumKey);
      case "all":
      default:
        return true;
    }
  }

  function buildWorthSummary(releaseIds, releaseIdToRecord, worthStore) {
    const rankedEntries = releaseIds
      .map((releaseId) => {
        const worthEntry = worthStore[releaseId] || null;
        if (!worthEntry || !Number.isFinite(Number(worthEntry.value)) || Number(worthEntry.value) <= 0) {
          return null;
        }

        const matchingRecord = releaseIdToRecord.get(releaseId) || null;

        return {
          albumKey: matchingRecord ? getAlbumKey(matchingRecord) : null,
          artist: matchingRecord?.Artist || "Unknown Artist",
          title: matchingRecord?.Title || "Unknown Album",
          year: matchingRecord?.Released || "",
          releaseId,
          value: Number(worthEntry.value),
          currency: worthEntry.currency || "USD",
          record: matchingRecord,
          updatedAt: Number(worthEntry.updatedAt) || 0,
        };
      })
      .filter(Boolean)
      .sort((firstEntry, secondEntry) => secondEntry.value - firstEntry.value);

    const newestUpdate = rankedEntries.reduce(
      (latest, entry) => Math.max(latest, Number(entry.updatedAt) || 0),
      0
    );

    return {
      estimate: {
        total: rankedEntries.reduce((sum, entry) => sum + entry.value, 0),
        sampled: rankedEntries.length,
        sampleSize: releaseIds.length,
        currency: rankedEntries[0]?.currency || "USD",
      },
      ranked: rankedEntries.slice(0, 20),
      newestUpdate,
    };
  }

  async function loadCollectionWorthEstimate(options = {}) {
    const { refresh = true, forceAll = false } = options;
    const worthStoreSnapshot = worthByReleaseRef.current;
    const releaseIdToContext = new Map();
    const releaseIdToRecord = new Map();

    records.forEach((record) => {
      const releaseId = normalizeReleaseId(record.release_id || record.releaseId);
      if (!releaseId || releaseIdToContext.has(releaseId)) {
        return;
      }

      releaseIdToContext.set(releaseId, {
        artist: record.Artist,
        title: record.Title,
        year: record.Released,
      });
      releaseIdToRecord.set(releaseId, record);
    });

    const releaseIds = Array.from(releaseIdToContext.keys());

    if (!releaseIds.length) {
      setCollectionWorthEstimate({
        total: 0,
        sampled: 0,
        sampleSize: 0,
        currency: "USD",
      });
      setWorthRankedAlbums([]);
      setWorthLastUpdatedAt(0);
      return;
    }

    const initialSummary = buildWorthSummary(releaseIds, releaseIdToRecord, worthStoreSnapshot);
    setCollectionWorthEstimate(initialSummary.estimate);
    setWorthRankedAlbums(initialSummary.ranked);
    setWorthLastUpdatedAt(initialSummary.newestUpdate);

    if (!refresh || worthRefreshInFlightRef.current) {
      return;
    }

    const now = Date.now();
    const refreshReleaseIds = forceAll
      ? releaseIds
      : releaseIds
      .map((releaseId) => ({
        releaseId,
        updatedAt: Number(worthStoreSnapshot[releaseId]?.updatedAt) || 0,
      }))
      .sort((firstEntry, secondEntry) => {
        const firstStale = now - firstEntry.updatedAt >= WORTH_STALE_MS ? 0 : 1;
        const secondStale = now - secondEntry.updatedAt >= WORTH_STALE_MS ? 0 : 1;

        if (firstStale !== secondStale) {
          return firstStale - secondStale;
        }

        return firstEntry.updatedAt - secondEntry.updatedAt;
      })
      .slice(0, WORTH_REFRESH_BATCH_SIZE)
      .map((entry) => entry.releaseId);

    if (!refreshReleaseIds.length) {
      return;
    }

    worthRefreshInFlightRef.current = true;
    setWorthLoading(true);
    setWorthRefreshProgress({
      active: true,
      processed: 0,
      total: refreshReleaseIds.length,
      mode: forceAll ? "full" : "batch",
    });

    try {
      const nextWorthByRelease = {
        ...worthStoreSnapshot,
      };

      for (let index = 0; index < refreshReleaseIds.length; index += 4) {
        const chunk = refreshReleaseIds.slice(index, index + 4);
        const results = await Promise.allSettled(
          chunk.map(async (releaseId) => {
            const fallbackContext = releaseIdToContext.get(releaseId) || null;
            return getRelease(releaseId, fallbackContext);
          })
        );

        results.forEach((result, resultIndex) => {
          const releaseId = chunk[resultIndex] || null;
          if (!releaseId) {
            return;
          }

          if (result.status !== "fulfilled") {
            nextWorthByRelease[releaseId] = {
              value: null,
              currency: "USD",
              updatedAt: Date.now(),
            };
            return;
          }

          const releaseData = result.value;
          const lowestPrice = Number(releaseData?.lowestPrice);

          if (!Number.isFinite(lowestPrice) || lowestPrice <= 0) {
            nextWorthByRelease[releaseId] = {
              value: null,
              currency: releaseData?.priceCurrency || "USD",
              updatedAt: Date.now(),
            };
            return;
          }

          nextWorthByRelease[releaseId] = {
            value: lowestPrice,
            currency: releaseData?.priceCurrency || "USD",
            updatedAt: Date.now(),
          };
        });

        setWorthRefreshProgress((currentProgress) => ({
          ...currentProgress,
          processed: Math.min(currentProgress.total, index + chunk.length),
        }));
      }

      setWorthByRelease(nextWorthByRelease);
      worthByReleaseRef.current = nextWorthByRelease;

      try {
        localStorage.setItem(WORTH_BY_RELEASE_KEY, JSON.stringify(nextWorthByRelease));
      } catch {
        // Ignore storage failures and keep the in-memory worth cache.
      }

      const refreshedSummary = buildWorthSummary(releaseIds, releaseIdToRecord, nextWorthByRelease);
      setCollectionWorthEstimate(refreshedSummary.estimate);
      setWorthRankedAlbums(refreshedSummary.ranked);
      setWorthLastUpdatedAt(refreshedSummary.newestUpdate);
    } finally {
      worthRefreshInFlightRef.current = false;
      setWorthLoading(false);
      setWorthRefreshProgress((currentProgress) => ({
        ...currentProgress,
        active: false,
      }));
    }
  }

  useEffect(() => {
    let isMounted = true;
    const shouldRunWorthNetworkRefresh = location.pathname === "/home" || worthDetailsOpen;

    async function fetchWorthData() {
      if (!isMounted) {
        return;
      }

      await loadCollectionWorthEstimate({
        refresh: shouldRunWorthNetworkRefresh,
        forceAll: shouldRunWorthNetworkRefresh && worthAutoFullReprice,
      });
    }

    void fetchWorthData();

    const intervalId = window.setInterval(() => {
      void loadCollectionWorthEstimate({
        refresh: shouldRunWorthNetworkRefresh,
        forceAll: shouldRunWorthNetworkRefresh && worthAutoFullReprice,
      });
    }, WORTH_REFRESH_INTERVAL_MS);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [records, worthAutoFullReprice, location.pathname, worthDetailsOpen]);

  const filteredRecords = searchMatchedRecords.filter((record) =>
    recordMatchesFilter(record, activeFilter)
  );

  const letterFilteredRecords = (() => {
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
  })();

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

  const favouriteRecords = records.filter((record) => {
    const savedDetails = savedAlbumDetails[getAlbumKey(record)] || {};
    return Boolean(savedDetails.favorite);
  });

  const topRatedRecords = records.filter((record) => {
    const savedDetails = savedAlbumDetails[getAlbumKey(record)] || {};
    return Number(savedDetails.rating) === 5;
  });

  const recordsByAlbumKey = useMemo(() => {
    const byAlbumKey = new Map();

    records.forEach((record) => {
      byAlbumKey.set(getAlbumKey(record), record);
    });

    return byAlbumKey;
  }, [records]);

  const memoriesByArtist = (() => {
    const groupedMemories = new Map();

    Object.entries(savedAlbumDetails).forEach(([albumKey, savedDetails]) => {
      const memoryText = savedDetails?.memory?.trim();
      const trackMemoryEntries = Object.entries(savedDetails?.trackMemories || {})
        .filter(([, trackMemory]) => String(trackMemory || "").trim());
      if (!memoryText && !trackMemoryEntries.length) {
        return;
      }

      const matchingRecord = recordsByAlbumKey.get(albumKey) || null;
      const fallback = parseAlbumKeyFallback(albumKey);
      const artist =
        (matchingRecord?.Artist || savedDetails.artist || fallback.artist || "Unknown Artist").trim() ||
        "Unknown Artist";
      const title = (matchingRecord?.Title || savedDetails.title || fallback.title || "Unknown Album").trim() ||
        "Unknown Album";
      const released = matchingRecord?.Released || savedDetails.released || fallback.released || "";
      const recordForOpen = matchingRecord
        ? {
            ...matchingRecord,
            // Preserve the exact saved-memory key so we open and edit the right memory entry.
            albumKey,
          }
        : {
            albumKey,
            release_id: normalizeReleaseId(savedDetails.release_id),
            Artist: artist,
            Title: title,
            Released: released || "Unknown",
            cover: null,
            thumb: null,
          };

      const artworkEntry = getArtworkEntry(recordForOpen);
      const artworkUrl = artworkEntry?.coverUrl || recordForOpen?.cover || recordForOpen?.thumb || null;

      if (!groupedMemories.has(artist)) {
        groupedMemories.set(artist, []);
      }

      if (memoryText) {
        groupedMemories.get(artist).push({
          albumKey,
          recordKey: `memory-${albumKey}`,
          title,
          released,
          memory: memoryText,
          record: recordForOpen,
          artworkUrl,
          memoryType: "album",
        });
      }

      trackMemoryEntries.forEach(([trackKey, trackMemory]) => {
        const normalizedTrackMemory = String(trackMemory || "").trim();
        if (!normalizedTrackMemory) {
          return;
        }

        const separatorIndex = trackKey.indexOf(":");
        const trackTitle = (separatorIndex >= 0 ? trackKey.slice(separatorIndex + 1) : trackKey).trim();
        if (!trackTitle) {
          return;
        }

        groupedMemories.get(artist).push({
          albumKey,
          recordKey: `track-memory-${albumKey}-${trackKey}`,
          title,
          trackTitle,
          released,
          memory: normalizedTrackMemory,
          record: recordForOpen,
          artworkUrl,
          memoryType: "track",
          trackKey,
        });
      });
    });

    return Array.from(groupedMemories.entries())
      .map(([artist, entries]) => ({
        artist,
        entries: [...entries].sort((firstEntry, secondEntry) => firstEntry.title.localeCompare(secondEntry.title)),
      }))
      .sort((firstGroup, secondGroup) => firstGroup.artist.localeCompare(secondGroup.artist));
  })();

  useEffect(() => {
    if (location.pathname !== "/memories") {
      return;
    }

    let isCanceled = false;
    const queuedRecords = [];
    const queuedAlbumKeys = new Set();

    Object.entries(savedAlbumDetails).forEach(([albumKey, savedDetails]) => {
      if (!savedDetails?.memory?.trim()) {
        return;
      }

      const matchingRecord = recordsByAlbumKey.get(albumKey);
      const fallback = parseAlbumKeyFallback(albumKey);

      const candidateRecord = matchingRecord
        ? {
            ...matchingRecord,
            albumKey,
          }
        : {
            albumKey,
            release_id: normalizeReleaseId(savedDetails.release_id),
            Artist: savedDetails.artist || fallback.artist || "Unknown Artist",
            Title: savedDetails.title || fallback.title || "Unknown Album",
            Released: savedDetails.released || fallback.released || "Unknown",
            cover: null,
            thumb: null,
          };

      const candidateAlbumKey = getAlbumKey(candidateRecord);
      if (queuedAlbumKeys.has(candidateAlbumKey)) {
        return;
      }
      queuedAlbumKeys.add(candidateAlbumKey);

      if (customArtworkByAlbumKey[candidateAlbumKey]) {
        return;
      }

      const releaseId = normalizeReleaseId(candidateRecord.release_id || candidateRecord.releaseId);
      if (!releaseId) {
        return;
      }

      const artworkEntry = artworkEntries[candidateAlbumKey] || {
        status: "idle",
        coverUrl: null,
        error: null,
      };

      if (artworkEntry.coverUrl || artworkEntry.status === "loading" || artworkEntry.status === "missing") {
        return;
      }

      queuedRecords.push(candidateRecord);
    });

    if (!queuedRecords.length) {
      return;
    }

    async function hydrateMemoriesArtwork() {
      for (let index = 0; index < queuedRecords.length; index += 3) {
        if (isCanceled) {
          return;
        }

        const chunk = queuedRecords.slice(index, index + 3);
        await Promise.allSettled(
          chunk.map((record) =>
            artworkManager.ensureAlbumArtwork(
              {
                ...record,
                albumKey: getAlbumKey(record),
              },
              getRelease
            )
          )
        );

        if (!isCanceled) {
          refreshArtworkEntries();
        }
      }
    }

    void hydrateMemoriesArtwork();

    return () => {
      isCanceled = true;
    };
  }, [
    location.pathname,
    savedAlbumDetails,
    recordsByAlbumKey,
    customArtworkByAlbumKey,
    artworkEntries,
  ]);

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

  function dismissAlbumModalForNavigation() {
    setSelectedAlbum(null);
  }

  function handleNavigationClick(item) {
    dismissAlbumModalForNavigation();

    if (item.to === "/collection") {
      setActiveFilter("all");
      setCollectionLetter("ALL");
      setSearch("");
    }
  }

  async function openAlbum(record) {
    const albumKey = getAlbumKey(record);
    const savedDetails = savedAlbumDetails[albumKey] || {};
    const artworkEntry = getArtworkEntry(record);
    let releaseId = normalizeReleaseId(
      record.release_id
      || record.releaseId
      || record["Release ID"]
      || record.ReleaseID
      || record.id
    );
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
      release_id: releaseId,
      __openPathname: location.pathname,
    });

    if (!releaseId) {
      try {
        const matches = await searchDiscogsReleases({
          artist: record.Artist,
          query: record.Title,
        });
        const bestMatch = matches[0];

        if (bestMatch?.release_id) {
          releaseId = normalizeReleaseId(bestMatch.release_id);
          setSelectedAlbum((currentAlbum) =>
            currentAlbum && currentAlbum.albumKey === albumKey
              ? {
                  ...currentAlbum,
                  release_id: releaseId,
                }
              : currentAlbum
          );
        }
      } catch {
        // Leave the album open with its existing metadata if Discogs search fails.
      }
    }

    if (releaseId) {
      try {
        const releaseData = await getRelease(releaseId, {
          artist: record.Artist,
          title: record.Title,
          year: record.Released,
        });

        setSelectedAlbum((currentAlbum) => {
          if (!currentAlbum || currentAlbum.albumKey !== albumKey) {
            return currentAlbum;
          }

          const releaseTracks = Array.isArray(releaseData?.tracks) && releaseData.tracks.length > 0
            ? releaseData.tracks
            : currentAlbum.tracks || [];

          saveAlbumTrackIndex(
            {
              ...record,
              release_id: releaseId,
            },
            releaseTracks
          );

          return {
            ...currentAlbum,
            label: releaseData?.label || currentAlbum.label || "",
            genres: releaseData?.genres || currentAlbum.genres || "",
            tracks: releaseTracks,
          };
        });
      } catch {
        // The modal still shows any track data already present on the record.
      }
    }

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

  function saveAlbumDetails(details) {
    if (!details?.albumKey) {
      return;
    }

    setSavedAlbumDetails((currentDetails) => {
      const nextDetails = {
        ...currentDetails,
        [details.albumKey]: {
          memory: details.memory,
          trackMemories: details.trackMemories || {},
          favorite: details.favorite,
          rating: details.rating,
          artist: details.Artist || "",
          title: details.Title || "",
          released: details.Released || details.year || "",
          release_id: normalizeReleaseId(details.release_id || details.releaseId),
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
          trackMemories: details.trackMemories || currentEntry.trackMemories || {},
          favorite: details.favorite,
          rating: details.rating,
          artist: details.Artist || currentEntry.artist || "",
          title: details.Title || currentEntry.title || "",
          released: details.Released || details.year || currentEntry.released || "",
          release_id: normalizeReleaseId(details.release_id || details.releaseId || currentEntry.release_id),
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

  function saveTrackMemory(album, trackKey, memoryValue) {
    if (!album?.albumKey || !trackKey) {
      return;
    }

    setSavedAlbumDetails((currentDetails) => {
      const currentEntry = currentDetails[album.albumKey] || {};
      const nextTrackMemories = {
        ...(currentEntry.trackMemories || {}),
      };

      if (String(memoryValue || "").trim()) {
        nextTrackMemories[trackKey] = memoryValue;
      } else {
        delete nextTrackMemories[trackKey];
      }

      const nextDetails = {
        ...currentDetails,
        [album.albumKey]: {
          ...currentEntry,
          trackMemories: nextTrackMemories,
        },
      };

      try {
        localStorage.setItem(SAVED_MEMORIES_KEY, JSON.stringify(nextDetails));
      } catch {
        // Keep the track memory in memory if storage is unavailable.
      }

      return nextDetails;
    });

    setSelectedAlbum((currentAlbum) => {
      if (!currentAlbum || currentAlbum.albumKey !== album.albumKey) {
        return currentAlbum;
      }

      const nextTrackMemories = {
        ...(currentAlbum.trackMemories || {}),
      };

      if (String(memoryValue || "").trim()) {
        nextTrackMemories[trackKey] = memoryValue;
      } else {
        delete nextTrackMemories[trackKey];
      }

      return {
        ...currentAlbum,
        trackMemories: nextTrackMemories,
      };
    });
  }

  function deleteMemoryEntry(entry) {
    if (!entry?.albumKey) {
      return;
    }

    setSavedAlbumDetails((currentDetails) => {
      const currentEntry = currentDetails[entry.albumKey] || {};
      const nextEntry = {
        ...currentEntry,
      };

      if (entry.memoryType === "track" && entry.trackKey) {
        const nextTrackMemories = {
          ...(currentEntry.trackMemories || {}),
        };
        delete nextTrackMemories[entry.trackKey];
        nextEntry.trackMemories = nextTrackMemories;
      } else {
        nextEntry.memory = "";
      }

      const nextDetails = {
        ...currentDetails,
        [entry.albumKey]: nextEntry,
      };

      try {
        localStorage.setItem(SAVED_MEMORIES_KEY, JSON.stringify(nextDetails));
      } catch {
        // Keep the deletion in memory if storage is unavailable.
      }

      return nextDetails;
    });

    setSelectedAlbum((currentAlbum) => {
      if (!currentAlbum || currentAlbum.albumKey !== entry.albumKey) {
        return currentAlbum;
      }

      if (entry.memoryType === "track" && entry.trackKey) {
        const nextTrackMemories = {
          ...(currentAlbum.trackMemories || {}),
        };
        delete nextTrackMemories[entry.trackKey];

        return {
          ...currentAlbum,
          trackMemories: nextTrackMemories,
        };
      }

      return {
        ...currentAlbum,
        memory: "",
      };
    });
  }

  function editMemoryEntry(entry) {
    if (!entry?.record) {
      return;
    }

    const record = entry.memoryType === "track" && entry.trackKey
      ? {
          ...entry.record,
          __openTrackMemoryKey: entry.trackKey,
        }
      : entry.record;
    openAlbum(record);
  }

  function markPlayed(album, trackKey = "") {
    if (!album) {
      return;
    }

    const albumKey = getAlbumKey(album);
    const nextTrackKey = trackKey ? `${albumKey}::${trackKey}` : "";

    setPlayedAlbumKeys((currentKeys) => {
      const nextKeys = currentKeys.includes(albumKey) ? currentKeys : [...currentKeys, albumKey];
      try {
        localStorage.setItem(PLAYED_ALBUMS_KEY, JSON.stringify(nextKeys));
      } catch {
        // Keep played state in memory if storage is unavailable.
      }
      return nextKeys;
    });

    if (nextTrackKey) {
      setPlayedTrackKeys((currentKeys) => {
        const nextKeys = currentKeys.includes(nextTrackKey) ? currentKeys : [...currentKeys, nextTrackKey];
        try {
          localStorage.setItem(PLAYED_TRACKS_KEY, JSON.stringify(nextKeys));
        } catch {
          // Keep played state in memory if storage is unavailable.
        }
        return nextKeys;
      });
    }
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

  function exportLibraryBackup() {
    const exportedAt = new Date().toISOString();
    const fileName = `music-and-memories-backup-${exportedAt.slice(0, 10)}.json`;
    const backupPayload = {
      version: 1,
      exportedAt,
      data: {
        addedRecords,
        savedAlbumDetails,
        recentlyViewed,
          playedAlbumKeys,
          playedTrackKeys,
        customArtworkByAlbumKey,
        rollingStoneList,
        manualCollectionWorth,
        worthByRelease,
        localTrackIndex,
      },
    };

    const backupBlob = new Blob([JSON.stringify(backupPayload, null, 2)], {
      type: "application/json",
    });

    const downloadUrl = URL.createObjectURL(backupBlob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(downloadUrl);

    return fileName;
  }

  async function importLibraryBackup(file) {
    if (!file) {
      throw new Error("Choose a backup file first.");
    }

    const fileText = await file.text();
    const parsedBackup = JSON.parse(fileText);
    const backupData = parsedBackup?.data && typeof parsedBackup.data === "object"
      ? parsedBackup.data
      : parsedBackup;

    const nextAddedRecords = normalizeAddedRecords(backupData?.addedRecords || []);
    const nextSavedAlbumDetails = normalizeSavedAlbumDetails(backupData?.savedAlbumDetails || {});
    const nextRecentlyViewed = normalizeRecentlyViewedEntries(backupData?.recentlyViewed || []);
    const nextPlayedAlbumKeys = normalizePlayedKeys(backupData?.playedAlbumKeys || []);
    const nextPlayedTrackKeys = normalizePlayedKeys(backupData?.playedTrackKeys || []);
    const nextCustomArtwork = normalizeCustomArtworkEntries(backupData?.customArtworkByAlbumKey || {});
    const nextRollingStoneList = normalizeRollingStoneEntries(backupData?.rollingStoneList || []);
    const nextManualCollectionWorth = normalizeManualCollectionWorth(backupData?.manualCollectionWorth);
    const nextWorthByRelease = normalizeWorthByRelease(backupData?.worthByRelease || {});
    const nextLocalTrackIndex = normalizeTrackIndexEntries(backupData?.localTrackIndex || backupData?.trackIndex || []);

    setAddedRecords(nextAddedRecords);
    setSavedAlbumDetails(nextSavedAlbumDetails);
    setRecentlyViewed(nextRecentlyViewed);
    setPlayedAlbumKeys(nextPlayedAlbumKeys);
    setPlayedTrackKeys(nextPlayedTrackKeys);
    setCustomArtworkByAlbumKey(nextCustomArtwork);
    setRollingStoneList(nextRollingStoneList);
    setManualCollectionWorth(nextManualCollectionWorth);
    setWorthByRelease(nextWorthByRelease);
    setLocalTrackIndex(nextLocalTrackIndex);
    setRollingStoneStatus(nextRollingStoneList.length ? `Imported ${nextRollingStoneList.length} tracker entries.` : "");
    setSelectedAlbum(null);

    try {
      localStorage.setItem(ADDED_RECORDS_KEY, JSON.stringify(nextAddedRecords));
      localStorage.setItem(SAVED_MEMORIES_KEY, JSON.stringify(nextSavedAlbumDetails));
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(nextRecentlyViewed));
      localStorage.setItem(PLAYED_ALBUMS_KEY, JSON.stringify(nextPlayedAlbumKeys));
      localStorage.setItem(PLAYED_TRACKS_KEY, JSON.stringify(nextPlayedTrackKeys));
      localStorage.setItem(CUSTOM_ARTWORK_KEY, JSON.stringify(nextCustomArtwork));
      localStorage.setItem(ROLLING_STONE_LIST_KEY, JSON.stringify(nextRollingStoneList));
      saveLocalTrackIndex(nextLocalTrackIndex);
      if (nextManualCollectionWorth) {
        localStorage.setItem(MANUAL_COLLECTION_WORTH_KEY, JSON.stringify(nextManualCollectionWorth));
      } else {
        localStorage.removeItem(MANUAL_COLLECTION_WORTH_KEY);
      }
      localStorage.setItem(WORTH_BY_RELEASE_KEY, JSON.stringify(nextWorthByRelease));
    } catch {
      // Keep imported state in memory even if persistence hits a browser quota limit.
    }

    return `Imported ${nextAddedRecords.length} added records, ${Object.keys(nextSavedAlbumDetails).length} album notes, and ${Object.keys(nextCustomArtwork).length} custom artwork overrides.`;
  }

  function saveManualCollectionWorth(amountInput, currencyInput = "GBP") {
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("Enter a collection worth greater than 0.");
    }

    const nextValue = normalizeManualCollectionWorth({
      amount,
      currency: currencyInput,
      source: "discogs",
    });

    setManualCollectionWorth(nextValue);

    try {
      localStorage.setItem(MANUAL_COLLECTION_WORTH_KEY, JSON.stringify(nextValue));
    } catch {
      // Keep in-memory value even if localStorage is unavailable.
    }

    return `Saved manual Discogs worth: ${formatWorthInGbp(nextValue.amount, nextValue.currency)}.`;
  }

  function clearManualCollectionWorth() {
    setManualCollectionWorth(null);

    try {
      localStorage.removeItem(MANUAL_COLLECTION_WORTH_KEY);
    } catch {
      // Ignore localStorage failures and keep in-memory reset.
    }

    return "Manual Discogs worth cleared.";
  }

  function clearRecentlyViewedHistory() {
    setRecentlyViewed([]);

    try {
      localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify([]));
    } catch {
      // Ignore storage failures and keep the in-memory reset.
    }

    return "Recently viewed history cleared.";
  }

  function clearRollingStoneTracker() {
    setRollingStoneList([]);
    setRollingStoneStatus("");

    try {
      localStorage.setItem(ROLLING_STONE_LIST_KEY, JSON.stringify([]));
    } catch {
      // Ignore storage failures and keep the in-memory reset.
    }

    return "Rolling Stone tracker cleared.";
  }

  async function forceRefreshApp() {
    if (typeof window === "undefined") {
      return "Refreshing app...";
    }

    try {
      clearPersistentCacheEntries();

      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }

      if ("caches" in window) {
        const cacheKeys = await caches.keys();
        await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
      }
    } catch {
      // Continue reload attempt even if cleanup partially fails.
    }

    const targetUrl = `${window.location.pathname}${window.location.search || ""}`;
    refreshCounterRef.current += 1;
    window.location.replace(
      `${targetUrl}${targetUrl.includes("?") ? "&" : "?"}refresh=${refreshCounterRef.current}`
    );
    return "Refreshing app...";
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
              (() => {
                const artworkEntry = getArtworkEntry(record);

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
                    cover={artworkEntry.coverUrl}
                    artworkStatus={artworkEntry.status}
                  />
                );
              })()
            );
          })}
        </ul>
      </>
    );
  }

  function renderHomePage() {
    const latestArrivalAlbums = [...records]
      .map((record) => {
        const dateAddedRaw = record["Date Added"] || record.dateAdded || record.DateAdded || "";

        return {
          artist: record.Artist || "Unknown Artist",
          title: record.Title || "Unknown Album",
          year: record.Released || "Unknown",
          release_id: normalizeReleaseId(record.release_id || record.releaseId),
          record,
          sortValue: dateAddedRaw ? new Date(dateAddedRaw).getTime() : 0,
        };
      })
      .sort((firstAlbum, secondAlbum) => secondAlbum.sortValue - firstAlbum.sortValue)
      .slice(0, 10);

    const todaySeed = (() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const day = String(now.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    })();

    const tonightRecord = pickStableRecord(
      records,
      `${records.map(getAlbumKey).join("|")}|home|${todaySeed}|${tonightPickShuffleSeed}`
    );

    const tonightAlbum = tonightRecord
      ? {
          artist: tonightRecord.Artist || "Unknown Artist",
          title: tonightRecord.Title || "Unknown Album",
          year: tonightRecord.Released || "Unknown",
          release_id: normalizeReleaseId(tonightRecord.release_id || tonightRecord.releaseId),
          artworkUrl: getArtworkEntry(tonightRecord).coverUrl || tonightRecord.cover || tonightRecord.thumb || null,
          record: tonightRecord,
        }
      : null;

    const continueListeningAlbums = recentlyViewed.map((entry) => {
      const matchingRecord = records.find((record) => getAlbumKey(record) === entry.albumKey);
      const releaseId = normalizeReleaseId(matchingRecord?.release_id || matchingRecord?.releaseId || entry.release_id);

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

    function openWorthDetails() {
      setWorthDetailsOpen(true);
      if (!worthLoading && !worthRankedAlbums.length && !collectionWorthEstimate.sampled) {
        void loadCollectionWorthEstimate({ refresh: true, forceAll: worthAutoFullReprice });
      }
    }

    function toggleAutoFullReprice() {
      const nextValue = !worthAutoFullReprice;
      setWorthAutoFullReprice(nextValue);

      try {
        localStorage.setItem(WORTH_AUTO_FULL_REPRICE_KEY, JSON.stringify(nextValue));
      } catch {
        // Ignore storage failures and keep in-memory toggle state.
      }
    }

    const displayedWorthTotal = manualCollectionWorth?.amount ?? collectionWorthEstimate.total;
    const displayedWorthCurrency = manualCollectionWorth?.currency || collectionWorthEstimate.currency;
    const displayedWorthHasValue = Boolean(manualCollectionWorth) || collectionWorthEstimate.sampled > 0;
    const displayedWorthHint = manualCollectionWorth
      ? "Manual Discogs worth imported"
      : collectionWorthEstimate.sampled
        ? `From ${collectionWorthEstimate.sampled}/${collectionWorthEstimate.sampleSize} priced releases • updated ${formatLastUpdatedLabel(worthLastUpdatedAt)}`
        : "No Discogs price data yet";
    const worthCoverageLabel = `${collectionWorthEstimate.sampled}/${collectionWorthEstimate.sampleSize} priced`;

    const memoryCount = memoriesByArtist.reduce((count, group) => count + group.entries.length, 0);
    const dashboardStats = [
      { label: "Albums", value: records.length || 0, hint: "Curated sleeves" },
      { label: "Artists", value: collectionStats.totalArtists, hint: "Across the archive" },
      {
        label: "Not Listened",
        value: notListenedAlbumKeySet.size,
        hint: "Tap to view 5 picks",
        onClick: () => {
          setActiveFilter("unplayed5");
          setCollectionLetter("ALL");
          setSearch("");
          navigate("/collection");
        },
      },
      {
        label: "Memories",
        value: memoryCount,
        hint: "Stories saved - tap to open",
        onClick: () => navigate("/memories"),
      },
      {
        label: "Albums Played",
        value: `${playedAlbumKeys.filter((albumKey) => records.some((record) => getAlbumKey(record) === albumKey)).length}/${records.length}`,
        hint: "Played on YouTube or at home",
        onClick: () => {
          setActiveFilter("played");
          setCollectionLetter("ALL");
          setSearch("");
          navigate("/collection");
        },
      },
    ];
    const memoryEntries = memoriesByArtist.flatMap((group) => group.entries);
    const randomMemoryEntry = pickStableRecord(
      memoryEntries,
      memoryEntries.map((entry) => entry.recordKey).join("|")
    );
    const hour = new Date().getHours();
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const tonightSavedDetails = tonightRecord ? getSavedAlbum(tonightRecord) : {};

    function handleLatestArrivalSelect(album) {
      if (album?.record) {
        openAlbum(album.record);
      }
    }

    function handleOpenYouTubeMusic(record) {
      markPlayed(record);
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

    function handlePickAnotherTonightAlbum() {
      setTonightPickShuffleSeed((currentSeed) => currentSeed + 1);
    }

    return (
      <>
        <DashboardLayout
          hero={
          <HeroSection
            greeting={greeting}
            name="Music and Memories"
            subtitle="Pick your next spin."
            extra={<HomeTrackSearch onOpenAlbum={openAlbum} />}
            logo={mmMonogramLogo}
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
            onPickAnother={handlePickAnotherTonightAlbum}
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

        {worthDetailsOpen ? (
          <div className="worth-details-overlay" role="dialog" aria-modal="true" aria-label="Most valuable albums">
            <div className="worth-details-panel glass-panel">
              <div className="worth-details-header">
                <div>
                  <p className="section-heading__eyebrow">Discogs valuation</p>
                  <h3 className="section-heading__title">Most valuable albums</h3>
                </div>
                <button type="button" className="worth-details-close" onClick={() => setWorthDetailsOpen(false)}>
                  Close
                </button>
              </div>

              <div className="worth-details-toolbar">
                <button
                  type="button"
                  className="collection-button"
                  onClick={() => void loadCollectionWorthEstimate({ refresh: true })}
                  disabled={worthLoading}
                >
                  {worthLoading ? "Refreshing…" : "Refresh batch"}
                </button>
                <button
                  type="button"
                  className="surprise-button"
                  onClick={() => void loadCollectionWorthEstimate({ refresh: true, forceAll: true })}
                  disabled={worthLoading}
                >
                  {worthLoading ? "Working…" : "Full reprice all"}
                </button>
                <button
                  type="button"
                  className="surprise-button"
                  onClick={toggleAutoFullReprice}
                >
                  {worthAutoFullReprice ? "Auto full reprice: ON" : "Auto full reprice: OFF"}
                </button>
              </div>

              <p className="worth-details-summary">
                {displayedWorthHasValue
                  ? `Estimated total: ${formatWorthInGbp(displayedWorthTotal, displayedWorthCurrency)}`
                  : "No priced albums found yet."}
              </p>

              <p className="worth-details-meta">
                {worthCoverageLabel}
                {worthLastUpdatedAt ? ` • updated ${formatLastUpdatedLabel(worthLastUpdatedAt)}` : ""}
              </p>

              {worthRefreshProgress.active ? (
                <p className="worth-details-progress">
                  {worthRefreshProgress.mode === "full" ? "Full reprice" : "Batch refresh"}
                  {`: ${worthRefreshProgress.processed}/${worthRefreshProgress.total}`}
                </p>
              ) : null}

              {worthLoading ? (
                <p className="worth-details-empty">Loading Discogs values…</p>
              ) : worthRankedAlbums.length ? (
                <ul className="worth-details-list">
                  {worthRankedAlbums.map((entry, index) => (
                    <li key={entry.releaseId || `${entry.artist}-${entry.title}`} className="worth-details-item">
                      <div className="worth-details-item__copy">
                        <p className="worth-details-item__rank">#{index + 1}</p>
                        <button type="button" className="worth-details-item__button" onClick={() => entry.record && openAlbum(entry.record)}>
                          <span className="worth-details-item__title">{entry.title}</span>
                          <span className="worth-details-item__artist">{entry.artist}</span>
                        </button>
                      </div>
                      <span className="worth-details-item__value">{formatWorthInGbp(entry.value, entry.currency)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="worth-details-empty">Discogs price data is not available for your collection yet.</p>
              )}
            </div>
          </div>
        ) : null}
      </>
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
          {renderAlbumGrid(sortedCollectionRecords, "Premium dark glass collection view", true)}
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
    const [topRatedArtworkByAlbumKey, setTopRatedArtworkByAlbumKey] = useState({});

    function normalizeLooseMatchText(value) {
      return normalizeMatchText(value)
        .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
        .replace(/\b(remaster(?:ed)?|deluxe|expanded|anniversary|mono|stereo|edition|version)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function buildArtistAlbumMatchKeys(artist, album) {
      const artistStrict = normalizeMatchText(artist);
      const albumStrict = normalizeMatchText(album);
      const artistLoose = normalizeLooseMatchText(artist).replace(/^the\s+/, "");
      const albumLoose = normalizeLooseMatchText(album)
        .replace(/^the\s+/, "")
        .replace(/\s+-\s+.*$/, "");

      const keys = new Set([
        `${artistStrict}|||${albumStrict}`,
        `${artistLoose}|||${albumLoose}`,
        `${artistStrict.replace(/^the\s+/, "")}|||${albumStrict.replace(/^the\s+/, "")}`,
      ]);

      return Array.from(keys).filter((key) => key !== "|||");
    }

    function buildMissingEntryRecord(entry) {
      return {
        albumKey: `rs500-${normalizeMatchText(entry.artist)}-${normalizeMatchText(entry.album)}`,
        release_id: normalizeReleaseId(entry.release_id || entry.releaseId),
        Artist: entry.artist || "Unknown Artist",
        Title: entry.album || "Unknown Album",
        Released: "Unknown",
        Label: "",
        Format: "Vinyl",
        cover: entry.cover || entry.thumb || null,
        thumb: entry.thumb || entry.cover || null,
      };
    }

    async function openMissingAlbumDetails(entry) {
      const existingReleaseId = normalizeReleaseId(entry.release_id || entry.releaseId);

      if (existingReleaseId) {
        void openAlbum(buildMissingEntryRecord(entry));
        return;
      }

      try {
        const matches = await searchDiscogsReleases({
          artist: entry.artist,
          query: entry.album,
          barcode: "",
          releaseId: "",
        });
        const bestMatch = Array.isArray(matches) ? matches[0] : null;
        const resolvedReleaseId = normalizeReleaseId(bestMatch?.release_id);
        const resolvedThumb = bestMatch?.thumb || bestMatch?.cover || null;

        const enrichedEntry = {
          ...entry,
          release_id: resolvedReleaseId,
          thumb: resolvedThumb || entry.thumb || entry.cover || null,
          cover: bestMatch?.cover || resolvedThumb || entry.cover || entry.thumb || null,
        };

        if (resolvedReleaseId || resolvedThumb) {
          setRollingStoneList((currentList) => {
            const nextList = currentList.map((currentEntry) => {
              if (getRollingStoneEntryKey(currentEntry) !== getRollingStoneEntryKey(entry)) {
                return currentEntry;
              }

              return {
                ...currentEntry,
                release_id: enrichedEntry.release_id || currentEntry.release_id || null,
                thumb: enrichedEntry.thumb || currentEntry.thumb || null,
                cover: enrichedEntry.cover || currentEntry.cover || null,
              };
            });

            try {
              localStorage.setItem(ROLLING_STONE_LIST_KEY, JSON.stringify(nextList));
            } catch {
              // Ignore persistence failures and keep the in-memory update.
            }

            return nextList;
          });
        }

        void openAlbum(buildMissingEntryRecord(enrichedEntry));
      } catch {
        void openAlbum(buildMissingEntryRecord(entry));
      }
    }

    function openMissingAlbumYouTubeMusic(entry) {
      const search = `${entry.artist || ""} ${entry.album || ""}`.trim();
      const encodedSearch = encodeURIComponent(search);
      window.open(`https://music.youtube.com/search?q=${encodedSearch}`, "_blank", "noopener,noreferrer");
    }

    function openStoreSearch(entry, store) {
      const searchQuery = encodeURIComponent(`${entry.artist} ${entry.album} vinyl`);

      const storeUrls = {
        amazon: `https://www.amazon.co.uk/s?k=${searchQuery}`,
        hmv: `https://hmv.com/search?searchtext=${searchQuery}`,
        rarewaves: `https://www.rarewaves.com/search?q=${searchQuery}`,
        cheapest: `https://www.google.com/search?tbm=shop&q=${searchQuery}`,
      };

      const storeUrl = storeUrls[store];
      if (!storeUrl) {
        return;
      }

      window.open(storeUrl, "_blank", "noopener,noreferrer");
    }

    const collectionByArtistAlbum = (() => {
      const lookup = new Map();

      records.forEach((record) => {
        const keys = buildArtistAlbumMatchKeys(record.Artist, record.Title);
        keys.forEach((key) => {
          if (!lookup.has(key)) {
            lookup.set(key, record);
          }
        });
      });

      return lookup;
    })();

    const rollingStoneRows = (() => {
      return rollingStoneList
        .map((entry, index) => {
          const entryKeys = buildArtistAlbumMatchKeys(entry.artist, entry.album);
          const ownedRecord = entryKeys
            .map((key) => collectionByArtistAlbum.get(key))
            .find(Boolean) || null;
          const rankValue = Number.parseInt(entry.rank, 10);
          const rank = Number.isFinite(rankValue) ? rankValue : index + 1;

          return {
            ...entry,
            rank,
            ownedRecord,
          };
        })
        .sort((firstEntry, secondEntry) => firstEntry.rank - secondEntry.rank);
      })();

    useEffect(() => {
      if (!rollingStoneRows.length) {
        return;
      }

      const pendingRecords = rollingStoneRows
        .map((entry) => entry.ownedRecord)
        .filter((record) => {
          if (!record) {
            return false;
          }

          const albumKey = getAlbumKey(record);
          const artworkEntry = artworkEntries[albumKey] || { status: "idle", coverUrl: null };

          return (
            !topRatedArtworkByAlbumKey[albumKey] &&
            !customArtworkByAlbumKey[albumKey] &&
            !artworkEntry.coverUrl &&
            artworkEntry.status !== "loading" &&
            artworkEntry.status !== "missing"
          );
        })
        .slice(0, 12);
      const pendingEntries = rollingStoneRows
        .filter((entry) => {
          if (entry.ownedRecord) {
            return false;
          }

          const entryKey = getRollingStoneEntryKey(entry);
          return !topRatedArtworkByAlbumKey[entryKey] && !entry.thumb && !entry.cover;
        })
        .slice(0, 12);

      let isCanceled = false;

      async function loadTopRatedArtwork() {
        await Promise.allSettled(
          pendingRecords.map((record) => {
            const albumKey = getAlbumKey(record);
            return artworkManager.ensureAlbumArtwork({ ...record, albumKey }, getRelease);
          })
        );
        const fallbackResults = await Promise.allSettled(
          pendingEntries.map(async (entry) => ({
            entryKey: getRollingStoneEntryKey(entry),
            artworkUrl: await getArtworkForContext({
              artist: entry.artist,
              title: entry.album,
            }),
          }))
        );

        if (!isCanceled) {
          setTopRatedArtworkByAlbumKey((currentArtwork) => {
            const nextArtwork = { ...currentArtwork };
            let hasNewArtwork = false;

            pendingRecords.forEach((record) => {
              const albumKey = getAlbumKey(record);
              const artworkEntry = artworkManager.getEntry(albumKey);
              if (artworkEntry.coverUrl) {
                nextArtwork[albumKey] = artworkEntry.coverUrl;
                hasNewArtwork = true;
              }
            });

            fallbackResults.forEach((result) => {
              if (result.status === "fulfilled" && result.value.artworkUrl) {
                nextArtwork[result.value.entryKey] = result.value.artworkUrl;
                hasNewArtwork = true;
              }
            });

            return hasNewArtwork ? nextArtwork : currentArtwork;
          });
        }
      }

      void loadTopRatedArtwork();

      return () => {
        isCanceled = true;
      };
    }, [rollingStoneRows, artworkEntries, customArtworkByAlbumKey, topRatedArtworkByAlbumKey]);

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
              {rollingStoneRows.map((entry) => {
                const artworkUrl = entry.ownedRecord
                  ? (
                      customArtworkByAlbumKey[getAlbumKey(entry.ownedRecord)] ||
                      topRatedArtworkByAlbumKey[getAlbumKey(entry.ownedRecord)] ||
                      getArtworkEntry(entry.ownedRecord).coverUrl ||
                      entry.ownedRecord.cover ||
                      entry.ownedRecord.thumb ||
                      null
                    )
                    : (
                        entry.thumb
                        || entry.cover
                        || topRatedArtworkByAlbumKey[getRollingStoneEntryKey(entry)]
                        || null
                      );

                return (
                <li key={`${entry.rank}-${entry.artist}-${entry.album}`} className="rolling-stone-panel__item">
                  <div className="rolling-stone-panel__artwork" aria-hidden="true">
                    {artworkUrl ? (
                      <img src={artworkUrl} alt="" loading="lazy" decoding="async" />
                    ) : (
                      <span className="rolling-stone-panel__artwork-placeholder">RS</span>
                    )}
                  </div>
                  <p className="rolling-stone-panel__rank">#{entry.rank}</p>
                  <div className="rolling-stone-panel__copy">
                    <p className="rolling-stone-panel__album">{entry.album}</p>
                    <p className="rolling-stone-panel__artist">{entry.artist}</p>
                  </div>
                  <div
                    className={`rolling-stone-panel__state ${
                      entry.ownedRecord ? "rolling-stone-panel__state--owned" : "rolling-stone-panel__state--missing"
                    }`}
                  >
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
                      <>
                        <span className="rolling-stone-panel__missing" aria-label="Missing">
                          ○
                        </span>
                        <div className="rolling-stone-panel__buy-actions" aria-label="Buy options">
                          <button
                            type="button"
                            className="rolling-stone-panel__buy-link"
                            onClick={() => openMissingAlbumDetails(entry)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="rolling-stone-panel__buy-link"
                            onClick={() => openMissingAlbumYouTubeMusic(entry)}
                          >
                            YouTube Music
                          </button>
                          <button
                            type="button"
                            className="rolling-stone-panel__buy-link"
                            onClick={() => openStoreSearch(entry, "cheapest")}
                          >
                            Find Cheapest
                          </button>
                          <button
                            type="button"
                            className="rolling-stone-panel__buy-link"
                            onClick={() => openStoreSearch(entry, "amazon")}
                          >
                            Amazon
                          </button>
                          <button
                            type="button"
                            className="rolling-stone-panel__buy-link"
                            onClick={() => openStoreSearch(entry, "hmv")}
                          >
                            HMV
                          </button>
                          <button
                            type="button"
                            className="rolling-stone-panel__buy-link"
                            onClick={() => openStoreSearch(entry, "rarewaves")}
                          >
                            Rarewaves
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </li>
                );
              })}
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
                      <div className="memories-group__content">
                        {entry.artworkUrl ? (
                          <img
                            src={entry.artworkUrl}
                            alt={`${entry.title} artwork`}
                            className="memories-group__artwork"
                          />
                        ) : null}
                        <div className="memories-group__copy">
                          <button
                            type="button"
                            className="memories-group__album"
                            onClick={() => openAlbum(entry.record)}
                          >
                            {entry.memoryType === "track" ? `${entry.trackTitle} • ${entry.title}` : entry.title}
                            {entry.released ? ` (${entry.released})` : ""}
                          </button>
                          <p className="memories-group__text">{entry.memory}</p>
                          <div className="memories-group__actions" aria-label="Memory actions">
                            <button
                              type="button"
                              className="memories-group__action"
                              onClick={() => editMemoryEntry(entry)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="memories-group__action memories-group__action--danger"
                              onClick={() => {
                                if (window.confirm("Delete this memory?")) {
                                  deleteMemoryEntry(entry);
                                }
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </div>
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
                    onClick={() => handleNavigationClick(item)}
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
          {location.pathname !== "/" && location.pathname !== "/home" ? (
            <header className="app-hero">
              <p className="app-kicker">Music & Memories</p>
              <h1 className="app-title">
                <img src={mmMonogramLogo} alt="M&amp;M" className="app-title__logo" />
                <span>Music &amp; Memories</span>
              </h1>
              <p className="app-tagline">Every record has a story.</p>
            </header>
          ) : null}

          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home" element={renderHomePage()} />
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
                <CollectionInsightsView
                  records={records}
                  savedAlbumDetails={savedAlbumDetails}
                  getAlbumKey={getAlbumKey}
                  getArtworkEntry={getArtworkEntry}
                  onArtistClick={openArtistView}
                  onBackToCollection={() => navigate("/collection")}
                />
              }
            />
            <Route path="/memories" element={<MemoriesPage />} />
            <Route
              path="/settings"
              element={
                <SettingsPage
                  manualCollectionWorth={manualCollectionWorth}
                  backupSummary={{
                    addedRecords: addedRecords.length,
                    albumNotes: Object.keys(savedAlbumDetails).length,
                    recentlyViewed: recentlyViewed.length,
                    customArtwork: Object.keys(customArtworkByAlbumKey).length,
                    rollingStoneEntries: rollingStoneList.length,
                  }}
                  onExportBackup={exportLibraryBackup}
                  onImportBackup={importLibraryBackup}
                  onSaveManualCollectionWorth={saveManualCollectionWorth}
                  onClearManualCollectionWorth={clearManualCollectionWorth}
                  onClearRecentlyViewed={clearRecentlyViewedHistory}
                  onClearRollingStoneTracker={clearRollingStoneTracker}
                  onForceRefreshApp={forceRefreshApp}
                />
              }
            />
          </Routes>

          <nav className="app-nav app-nav--mobile" aria-label="Bottom navigation">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => handleNavigationClick(item)}
                className={({ isActive }) =>
                  `app-nav__button app-nav__button--mobile${isActive ? " is-active" : ""}`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <AlbumModal
            album={selectedAlbum && selectedAlbum.__openPathname === location.pathname ? selectedAlbum : null}
            onClose={closeAlbum}
            onSave={saveAlbumDetails}
            onMetadataChange={saveAlbumMetadata}
            onTrackMemorySave={saveTrackMemory}
                  onTrackPlayed={markPlayed}
                  playedAlbumKeys={playedAlbumKeySet}
                  playedTrackKeys={playedTrackKeys}
            onArtistClick={openArtistView}
            onCustomArtworkUpload={saveCustomArtwork}
            onCustomArtworkRemove={clearCustomArtwork}
            hasCustomArtwork={Boolean(
              selectedAlbum
              && selectedAlbum.__openPathname === location.pathname
              && customArtworkByAlbumKey[selectedAlbum.albumKey]
            )}
          />
        </div>
      </div>
    </div>
  );
}

export default App;
