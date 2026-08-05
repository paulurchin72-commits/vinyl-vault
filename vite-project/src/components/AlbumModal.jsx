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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.82)",
        backdropFilter: "blur(12px)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 1000,
        padding: "24px",
      }}
      onClick={onClose}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "linear-gradient(180deg, rgba(31,31,31,0.98) 0%, rgba(18,18,18,0.98) 100%)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "24px",
          width: "100%",
          maxWidth: "860px",
          padding: "28px",
          color: "white",
          boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
          position: "relative",
        }}
      >
        <button
          onClick={onClose}
          aria-label="Close album details"
          style={{
            position: "absolute",
            top: "18px",
            right: "18px",
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.08)",
            color: "white",
            borderRadius: "999px",
            width: "42px",
            height: "42px",
            fontSize: "18px",
            cursor: "pointer",
          }}
        >
          ×
        </button>

        <div
          style={{
            display: "flex",
            gap: "28px",
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              width: "min(100%, 420px)",
              aspectRatio: "1 / 1",
              flexShrink: 0,
              borderRadius: "28px",
              overflow: "hidden",
              background: "linear-gradient(135deg, #222 0%, #111 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            }}
          >
            {artwork ? (
              <img
                src={artwork}
                alt={albumData.Title}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
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

          <div style={{ flex: "1 1 320px", minWidth: 0, textAlign: "left" }}>
            <p
              style={{
                margin: 0,
                color: "#f5c542",
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontSize: "12px",
              }}
            >
              Album Details
            </p>

            <h1 style={{ marginTop: "10px", marginBottom: "8px" }}>
              <button
                type="button"
                className="artist-link-button artist-link-button--modal"
                onClick={() => onArtistClick?.(albumData.Artist)}
              >
                {albumData.Artist}
              </button>
            </h1>

            <h2
              style={{
                fontWeight: "normal",
                color: "#cccccc",
                marginBottom: "18px",
              }}
            >
              {albumData.Title}
            </h2>

            <p style={{ color: "#ddd", marginBottom: "18px" }}>
              <strong>Release Year:</strong> {releaseYear}
            </p>

            {albumData.label ? (
              <p style={{ color: "#ddd", marginBottom: "10px" }}>
                <strong>Label:</strong> {albumData.label}
              </p>
            ) : null}

            {genre ? (
              <p style={{ color: "#ddd", marginBottom: "10px" }}>
                <strong>Genre:</strong> {genre}
              </p>
            ) : null}

            <hr
              style={{
                borderColor: "rgba(255,255,255,0.12)",
                margin: "20px 0 24px",
              }}
            />

            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "center",
                marginBottom: "18px",
              }}
            >
              <button
                onClick={handleFavoriteToggle}
                style={{
                  padding: "10px 14px",
                  borderRadius: "999px",
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: favorite ? "rgba(255, 90, 95, 0.16)" : "rgba(255,255,255,0.06)",
                  color: favorite ? "#ff5a5f" : "white",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
              >
                ❤️ Favourite {favorite ? "On" : "Off"}
              </button>

              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleRatingChange(value)}
                    aria-label={`${value} star rating`}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: value <= rating ? "#f5c542" : "#6b6b6b",
                      fontSize: "18px",
                      cursor: "pointer",
                      padding: 0,
                    }}
                  >
                    ★
                  </button>
                ))}
                <span style={{ color: "#bbb", fontSize: "14px" }}>
                  {rating}/5
                </span>
              </div>
            </div>

            <h3 style={{ marginBottom: "12px" }}>📝 My Memory</h3>

            <textarea
              placeholder="Write your memory of this album..."
              value={memory}
              onChange={(event) => setMemory(event.target.value)}
              style={{
                width: "100%",
                minHeight: "150px",
                boxSizing: "border-box",
                background: "#2a2a2a",
                color: "white",
                border: "1px solid #444",
                borderRadius: "14px",
                padding: "12px",
                resize: "vertical",
                fontFamily: "inherit",
                fontSize: "16px",
              }}
            />

            {saveMessage ? (
              <p style={{ color: "#f5c542", marginTop: "10px" }}>{saveMessage}</p>
            ) : null}

            <div
              style={{
                display: "flex",
                gap: "12px",
                flexWrap: "wrap",
                marginTop: "20px",
              }}
            >
              <button
                onClick={handleSave}
                style={{
                  padding: "12px 22px",
                  background: "#f5c542",
                  color: "#111",
                  border: "none",
                  borderRadius: "12px",
                  cursor: "pointer",
                  fontWeight: "bold",
                  boxShadow: "0 10px 20px rgba(245,197,66,0.18)",
                }}
              >
                Save
              </button>

              <button
                onClick={onClose}
                style={{
                  padding: "12px 22px",
                  background: "rgba(255,255,255,0.08)",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: "12px",
                  cursor: "pointer",
                  fontWeight: "bold",
                }}
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