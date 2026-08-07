import { useEffect, useRef, useState } from "react";
import { getArtworkUrl } from "../services/artworkService";

const MAX_CUSTOM_ARTWORK_DIMENSION = 800;
const CUSTOM_ARTWORK_QUALITY = 0.78;

function AlbumModal({
  album,
  onClose,
  onSave,
  onMetadataChange,
  onArtistClick,
  onCustomArtworkUpload,
  onCustomArtworkRemove,
  hasCustomArtwork,
}) {
  const albumData = album || {};
  const releaseYear = albumData.year || albumData.Released || "Unknown";
  const artworkStatus = albumData.artworkStatus || "idle";
  const [memory, setMemory] = useState(albumData.memory || "");
  const [favorite, setFavorite] = useState(Boolean(albumData.favorite));
  const [rating, setRating] = useState(albumData.rating || 5);
  const [saveMessage, setSaveMessage] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [artworkUrl, setArtworkUrl] = useState(null);
  const [isArtworkResolved, setIsArtworkResolved] = useState(false);
  const artworkInputRef = useRef(null);

  useEffect(() => {
    setMemory(albumData.memory || "");
    setFavorite(Boolean(albumData.favorite));
    setRating(albumData.rating || 5);
    setSaveMessage("");
    setUploadMessage("");
  }, [album]);

  useEffect(() => {
    let isCanceled = false;

    async function loadArtworkUrl() {
      const releaseId = album?.release_id;
      const existingArtworkUrl = albumData.cover || albumData.thumb || null;

      if (existingArtworkUrl) {
        if (!isCanceled) {
          setArtworkUrl(existingArtworkUrl);
          setIsArtworkResolved(true);
        }
        return;
      }

      if (!releaseId) {
        if (!isCanceled) {
          setArtworkUrl(null);
          setIsArtworkResolved(true);
        }
        return;
      }

      try {
        console.log("AlbumModal release_id:", releaseId);
        const nextArtworkUrl = await getArtworkUrl(releaseId, {
          artist: albumData.Artist,
          title: albumData.Title,
          year: releaseYear,
        }, { preferLarge: true });
        console.log("Artwork URL:", nextArtworkUrl);

        if (!isCanceled) {
          setArtworkUrl(nextArtworkUrl);
        }
      } catch {
        if (!isCanceled) {
          setArtworkUrl(null);
        }
      } finally {
        if (!isCanceled) {
          setIsArtworkResolved(true);
        }
      }
    }

    setArtworkUrl(null);
    setIsArtworkResolved(false);
    loadArtworkUrl();

    return () => {
      isCanceled = true;
    };
  }, [album?.release_id]);

  if (!album) return null;

  function handleSave() {
    onSave?.({
      ...album,
      memory,
      favorite,
      rating,
    });
    setSaveMessage("Memory Saved");
  }

  function handleFavoriteToggle() {
    setFavorite((currentFavorite) => {
      const nextFavorite = !currentFavorite;

      onMetadataChange?.({
        ...album,
        memory,
        favorite: nextFavorite,
        rating,
      });

      return nextFavorite;
    });
  }

  function handleRatingChange(nextRating) {
    setRating(nextRating);

    onMetadataChange?.({
      ...album,
      memory,
      favorite,
      rating: nextRating,
    });
  }

  function handleOpenYouTubeMusic() {
    const search = `${albumData.Artist || ""} ${albumData.Title || ""}`.trim();
    const encodedSearch = encodeURIComponent(search);
    const url = `https://music.youtube.com/search?q=${encodedSearch}`;

    window.open(url, "_blank", "noopener,noreferrer");
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = () => reject(reader.error || new Error("Failed to read the selected image."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to decode selected artwork."));
      image.src = dataUrl;
    });
  }

  async function optimizeArtworkDataUrl(file) {
    const originalDataUrl = await readFileAsDataUrl(file);
    const image = await loadImage(originalDataUrl);

    const longestSide = Math.max(image.width, image.height);
    const scale = longestSide > MAX_CUSTOM_ARTWORK_DIMENSION
      ? MAX_CUSTOM_ARTWORK_DIMENSION / longestSide
      : 1;

    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");
    if (!context) {
      return originalDataUrl;
    }

    context.drawImage(image, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", CUSTOM_ARTWORK_QUALITY);
  }

  function triggerArtworkUpload() {
    artworkInputRef.current?.click();
  }

  async function handleArtworkUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setUploadMessage("Please upload a valid image file.");
      return;
    }

    try {
      const artworkDataUrl = await optimizeArtworkDataUrl(file);

      if (!artworkDataUrl) {
        setUploadMessage("Failed to process the selected image.");
        return;
      }

      onCustomArtworkUpload?.(album, artworkDataUrl);
      setArtworkUrl(artworkDataUrl);
      setIsArtworkResolved(true);
      setUploadMessage("Custom artwork applied (optimized for performance).");
    } catch {
      setUploadMessage("Failed to upload artwork. Try another image.");
    }
  }

  function handleRemoveCustomArtwork() {
    onCustomArtworkRemove?.(album);
    setUploadMessage("Custom artwork removed.");
  }

  const genre = albumData.genres || albumData.genre || "";

  return (
    <div className="album-modal" onClick={onClose}>
      <div className="album-modal__dialog" onClick={(event) => event.stopPropagation()}>
        <button
          onClick={onClose}
          aria-label="Close album details"
          className="album-modal__close"
        >
          ×
        </button>

        <div className="album-modal__layout">
          <div
            className="album-modal__art"
            role="button"
            tabIndex={0}
            onDoubleClick={triggerArtworkUpload}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                triggerArtworkUpload();
              }
            }}
            aria-label="Album artwork. Double click to upload custom artwork."
          >
            <input
              ref={artworkInputRef}
              type="file"
              accept="image/*"
              className="album-modal__artwork-input"
              onChange={handleArtworkUpload}
            />
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt={albumData.Title || albumData.title || "Album artwork"}
                className="album-modal__image"
              />
            ) : !isArtworkResolved && artworkStatus === "loading" ? (
              <div className="artwork-state artwork-state--loading artwork-state--modal" aria-label="Loading artwork">
                <span className="artwork-spinner" />
                <span className="artwork-state__label">Loading artwork</span>
              </div>
            ) : (
              <div className="artwork-state artwork-state--placeholder artwork-state--modal" aria-label="No artwork available">
                <span className="artwork-state__monogram">M&amp;M</span>
                <span className="artwork-state__label">Music &amp; Memories</span>
              </div>
            )}
          </div>
          <p className="album-modal__artwork-hint">Double-click cover art to upload your own image.</p>

          <div className="album-modal__content">
            <p className="album-modal__eyebrow">
              Album Details
            </p>

            <h1 className="album-modal__artist">
              <button
                type="button"
                className="artist-link-button artist-link-button--modal"
                onClick={() => onArtistClick?.(albumData.Artist)}
              >
                {albumData.Artist}
              </button>
            </h1>

            <h2 className="album-modal__title">
              {albumData.Title}
            </h2>

            <p className="album-modal__meta album-modal__meta--primary">
              <strong>Release Year:</strong> {releaseYear}
            </p>

            {albumData.label ? (
              <p className="album-modal__meta">
                <strong>Label:</strong> {albumData.label}
              </p>
            ) : null}

            {genre ? (
              <p className="album-modal__meta">
                <strong>Genre:</strong> {genre}
              </p>
            ) : null}

            <hr className="album-modal__rule" />

            <div className="album-modal__actions">
              <button
                onClick={handleFavoriteToggle}
                className={`album-modal__pill${favorite ? " is-active" : ""}`}
              >
                ❤️ Favourite {favorite ? "On" : "Off"}
              </button>

              <div className="album-modal__rating">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleRatingChange(value)}
                    aria-label={`${value} star rating`}
                    className={`album-modal__star${value <= rating ? " is-active" : ""}`}
                  >
                    ★
                  </button>
                ))}
                <span className="album-modal__rating-text">
                  {rating}/5
                </span>
              </div>
            </div>

            <h3 className="album-modal__memory-title">📝 My Memory</h3>

            <textarea
              placeholder="Write your memory of this album..."
              value={memory}
              onChange={(event) => setMemory(event.target.value)}
              className="album-modal__textarea"
            />

            {saveMessage ? (
              <p className="album-modal__save-message">{saveMessage}</p>
            ) : null}

            {uploadMessage ? <p className="album-modal__save-message">{uploadMessage}</p> : null}

            <div className="album-modal__footer">
              <button
                type="button"
                onClick={triggerArtworkUpload}
                className="album-modal__button album-modal__button--secondary"
              >
                Upload Artwork
              </button>

              {hasCustomArtwork ? (
                <button
                  type="button"
                  onClick={handleRemoveCustomArtwork}
                  className="album-modal__button album-modal__button--secondary"
                >
                  Remove Custom Art
                </button>
              ) : null}

              <button
                type="button"
                onClick={handleOpenYouTubeMusic}
                className="album-modal__button album-modal__button--secondary"
              >
                ▶ Listen on YouTube Music
              </button>

              <button
                onClick={handleSave}
                className="album-modal__button album-modal__button--primary"
              >
                Save
              </button>

              <button
                onClick={onClose}
                className="album-modal__button album-modal__button--secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AlbumModal;