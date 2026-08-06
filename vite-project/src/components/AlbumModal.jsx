import { useEffect, useState } from "react";

function AlbumModal({ album, onClose, onSave, onMetadataChange, onArtistClick }) {
  const albumData = album || {};
  const artwork = albumData.cover || albumData.thumb || null;
  const releaseYear = albumData.year || albumData.Released || "Unknown";
  const artworkStatus = albumData.artworkStatus || "idle";
  const [memory, setMemory] = useState(albumData.memory || "");
  const [favorite, setFavorite] = useState(Boolean(albumData.favorite));
  const [rating, setRating] = useState(albumData.rating || 5);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    setMemory(albumData.memory || "");
    setFavorite(Boolean(albumData.favorite));
    setRating(albumData.rating || 5);
    setSaveMessage("");
  }, [album]);

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
          <div className="album-modal__art">
            {artwork ? (
              <img
                src={artwork}
                alt={albumData.Title}
                className="album-modal__image"
              />
            ) : artworkStatus === "loading" ? (
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

            <div className="album-modal__footer">
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