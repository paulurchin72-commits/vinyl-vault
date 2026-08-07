import { useEffect, useRef } from "react";

function AlbumCard({
  record,
  cover,
  onClick = () => {},
  onArtistClick = () => {},
  onVisible = () => {},
  id,
  highlighted = false,
  favorite = false,
  rating = 0,
  artworkStatus = "idle",
}) {
  const cardRef = useRef(null);
  const hasTriggeredVisibility = useRef(false);
  const retryCountRef = useRef(0);
  const maxRetryAttempts = 2;

  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick(record);
    }
  }

  function handleArtistClick(event) {
    event.stopPropagation();
    onArtistClick(record.Artist);
  }

  const albumKey = record.albumKey || record.release_id || `${record.Artist}-${record.Title}-${record.Released}`;
  const traceStore = typeof globalThis !== "undefined" ? globalThis : null;
  const isTracedAlbum =
    traceStore?.__MM_TRACE_FIRST_ALBUM__?.albumKey === albumKey ||
    traceStore?.__MM_TRACE_SUCCESS_ALBUM__?.albumKey === albumKey;

  useEffect(() => {
    hasTriggeredVisibility.current = false;
    retryCountRef.current = 0;
  }, [albumKey]);

  useEffect(() => {
    const node = cardRef.current;

    if (!node || hasTriggeredVisibility.current) {
      return undefined;
    }

    if (typeof IntersectionObserver === "undefined") {
      hasTriggeredVisibility.current = true;
      onVisible(record);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const firstEntry = entries[0];

        if (!firstEntry?.isIntersecting || hasTriggeredVisibility.current) {
          return;
        }

        hasTriggeredVisibility.current = true;
        onVisible(record);
        observer.disconnect();
      },
      {
        rootMargin: "160px 0px",
        threshold: 0.01,
      }
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, [onVisible, record]);

  useEffect(() => {
    if (cover || artworkStatus !== "idle") {
      return undefined;
    }

    if (retryCountRef.current >= maxRetryAttempts) {
      return undefined;
    }

    const node = cardRef.current;
    if (!node) {
      return undefined;
    }

    const bounds = node.getBoundingClientRect();
    const isNearViewport = bounds.bottom >= -200 && bounds.top <= window.innerHeight + 200;

    if (!isNearViewport) {
      return undefined;
    }

    const retryDelayMs = 2800 + retryCountRef.current * 1200;
    const retryTimerId = window.setTimeout(() => {
      hasTriggeredVisibility.current = false;
      retryCountRef.current += 1;
      onVisible(record);
    }, retryDelayMs);

    return () => {
      window.clearTimeout(retryTimerId);
    };
  }, [cover, artworkStatus, onVisible, record]);

  if (isTracedAlbum) {
    if (traceStore.__MM_TRACE_LAST_ALBUM_CARD_COVER__ !== cover) {
      traceStore.__MM_TRACE_LAST_ALBUM_CARD_COVER__ = cover;
      console.log("[MM TRACE] 6.AlbumCard cover", {
        albumKey,
        cover,
      });
    }
  }

  return (
    <li
      ref={cardRef}
      id={id}
      onClick={() => onClick(record)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      className={`album-card${highlighted ? " album-card--highlighted" : ""}`}
    >
      <div className="album-card__art">
        {cover ? (
          <img
            src={cover}
            alt={record.Title}
            className="album-card__image"
            loading="lazy"
            decoding="async"
          />
        ) : artworkStatus === "loading" ? (
          <div className="artwork-state artwork-state--loading" aria-label="Loading artwork">
            <span className="artwork-spinner" />
            <span className="artwork-state__label">Loading artwork</span>
          </div>
        ) : (
          <div className="artwork-state artwork-state--placeholder" aria-label="No artwork available">
            <span className="artwork-state__monogram">M&amp;M</span>
            <span className="artwork-state__label">Music &amp; Memories</span>
          </div>
        )}
      </div>

      <div className="album-card__body">
        <p className="album-card__year">{record.Released}</p>

        <h3 className="album-card__artist">
          <button
            type="button"
            className="artist-link-button"
            onClick={handleArtistClick}
          >
            {record.Artist}
          </button>
        </h3>

        <p className="album-card__title">{record.Title}</p>

        <div className="album-card__footer">
          <span className={`album-card__heart${favorite ? " is-active" : ""}`}>
            {favorite ? "❤️" : "🤍"}
          </span>

          <div className="album-card__stars" aria-label={`Rated ${rating} out of 5`}>
            {[1, 2, 3, 4, 5].map((star) => (
              <span key={star} className={star <= rating ? "is-active" : ""}>
                ★
              </span>
            ))}
          </div>
        </div>
      </div>
    </li>
  );
}

export default AlbumCard;