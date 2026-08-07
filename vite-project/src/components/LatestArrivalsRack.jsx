import { useEffect, useMemo, useRef, useState } from "react";

function hashString(value) {
  const input = String(value || "");
  let hash = 0;

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }

  return Math.abs(hash);
}

function formatDateLabel(dateValue) {
  if (!dateValue) {
    return "Recently Added";
  }

  const parsed = new Date(dateValue);
  if (Number.isNaN(parsed.getTime())) {
    return "Recently Added";
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getTimeValue(dateValue) {
  const parsed = new Date(dateValue || 0);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function buildSleeveVisuals(album, index) {
  const seed = hashString(`${album?.releaseId || index}-${album?.title || ""}-${album?.artist || ""}`);

  const heightPercent = 86 + (seed % 13);
  const tiltDegrees = ((seed % 9) - 4) * 0.24;
  const shadowDepth = 16 + (seed % 8);
  const accentShift = seed % 4;

  return {
    heightPercent,
    tiltDegrees,
    shadowDepth,
    accentShift,
  };
}

function LatestArrivalsRack({ albums = [], onSelect = () => {} }) {
  const [activeReleaseId, setActiveReleaseId] = useState(null);
  const activeTimeoutRef = useRef(null);

  const preparedAlbums = useMemo(() => {
    return [...albums]
      .sort((firstAlbum, secondAlbum) => getTimeValue(secondAlbum.dateAdded) - getTimeValue(firstAlbum.dateAdded))
      .map((album, index) => ({
        ...album,
        __visuals: buildSleeveVisuals(album, index),
      }));
  }, [albums]);

  useEffect(() => {
    return () => {
      if (activeTimeoutRef.current) {
        window.clearTimeout(activeTimeoutRef.current);
      }
    };
  }, []);

  function handleAlbumSelect(album) {
    const releaseId = String(album?.releaseId || "");
    if (!releaseId) {
      onSelect(album);
      return;
    }

    setActiveReleaseId(releaseId);

    if (activeTimeoutRef.current) {
      window.clearTimeout(activeTimeoutRef.current);
    }

    activeTimeoutRef.current = window.setTimeout(() => {
      onSelect(album);
      setActiveReleaseId(null);
      activeTimeoutRef.current = null;
    }, 220);
  }

  return (
    <section className="latest-arrivals-rack" aria-label="Latest arrivals record rack">
      <header className="latest-arrivals-rack__header">
        <p className="latest-arrivals-rack__kicker">Latest Arrivals</p>
        <h2 className="latest-arrivals-rack__title">Fresh records on the front rail</h2>
      </header>

      <div className="latest-arrivals-rack__wood-frame" aria-hidden="true">
        <span className="latest-arrivals-rack__wood-grain latest-arrivals-rack__wood-grain--top" />
        <span className="latest-arrivals-rack__wood-grain latest-arrivals-rack__wood-grain--bottom" />
      </div>

      <div className="latest-arrivals-rack__viewport" role="list" aria-label="Latest album sleeves">
        {preparedAlbums.length ? (
          preparedAlbums.map((album, index) => {
            const releaseId = String(album.releaseId || `${album.title}-${album.artist}-${index}`);
            const isActive = activeReleaseId === String(album.releaseId || "");
            const visuals = album.__visuals;

            return (
              <button
                key={releaseId}
                type="button"
                className={`latest-arrivals-rack__sleeve${isActive ? " is-active" : ""}`}
                style={{
                  "--sleeve-height": `${visuals.heightPercent}%`,
                  "--sleeve-tilt": `${visuals.tiltDegrees}deg`,
                  "--sleeve-shadow": `${visuals.shadowDepth}px`,
                  "--accent-shift": visuals.accentShift,
                  "--stagger-delay": `${index * 36}ms`,
                }}
                onClick={() => handleAlbumSelect(album)}
                role="listitem"
                aria-label={`${album.title} by ${album.artist}`}
              >
                <span className="latest-arrivals-rack__sleeve-inner">
                  <span className="latest-arrivals-rack__sleeve-art">
                    {album.artwork ? (
                      <img
                        src={album.artwork}
                        alt={`${album.title} artwork`}
                        className="latest-arrivals-rack__image"
                        loading="lazy"
                      />
                    ) : (
                      <span className="latest-arrivals-rack__fallback-art" aria-hidden="true">
                        <span>MM</span>
                      </span>
                    )}
                  </span>
                  <span className="latest-arrivals-rack__meta">
                    <span className="latest-arrivals-rack__album">{album.title || "Untitled Album"}</span>
                    <span className="latest-arrivals-rack__artist">{album.artist || "Unknown Artist"}</span>
                    <span className="latest-arrivals-rack__date">{formatDateLabel(album.dateAdded)}</span>
                  </span>
                </span>
              </button>
            );
          })
        ) : (
          <p className="latest-arrivals-rack__empty">No latest arrivals yet.</p>
        )}
      </div>

      <style>{`
        .latest-arrivals-rack {
          position: relative;
          display: grid;
          gap: 14px;
          padding: clamp(14px, 2.8vw, 20px);
          border-radius: 22px;
          background:
            radial-gradient(circle at 28% 8%, rgba(231, 186, 104, 0.18), transparent 28%),
            linear-gradient(165deg, rgba(25, 19, 14, 0.92), rgba(15, 12, 10, 0.95));
          border: 1px solid rgba(209, 158, 74, 0.26);
          box-shadow:
            inset 0 1px 0 rgba(252, 226, 176, 0.12),
            0 22px 36px rgba(0, 0, 0, 0.34);
        }

        .latest-arrivals-rack__header {
          display: grid;
          gap: 4px;
        }

        .latest-arrivals-rack__kicker {
          margin: 0;
          color: rgba(232, 186, 106, 0.95);
          font-family: "Sora", "Avenir Next", "Segoe UI", sans-serif;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          font-size: 11px;
          font-weight: 700;
        }

        .latest-arrivals-rack__title {
          margin: 0;
          color: rgba(255, 244, 221, 0.98);
          font-family: "Fraunces", Georgia, serif;
          font-size: clamp(24px, 4vw, 34px);
          line-height: 1.05;
          letter-spacing: -0.02em;
        }

        .latest-arrivals-rack__wood-frame {
          position: relative;
          height: 34px;
          border-radius: 12px;
          background:
            linear-gradient(180deg, #9a6236, #744524 58%, #643b1e);
          border: 1px solid rgba(75, 40, 17, 0.75);
          box-shadow:
            inset 0 1px 0 rgba(255, 214, 152, 0.34),
            inset 0 -7px 12px rgba(55, 30, 12, 0.48);
        }

        .latest-arrivals-rack__wood-grain {
          position: absolute;
          left: 10px;
          right: 10px;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(255, 214, 151, 0.48), transparent);
        }

        .latest-arrivals-rack__wood-grain--top {
          top: 9px;
        }

        .latest-arrivals-rack__wood-grain--bottom {
          bottom: 8px;
        }

        .latest-arrivals-rack__viewport {
          display: grid;
          grid-auto-flow: column;
          grid-auto-columns: minmax(146px, 31vw);
          gap: 10px;
          align-items: end;
          overflow-x: auto;
          overflow-y: hidden;
          padding: 8px 2px 10px;
          scroll-behavior: smooth;
          scroll-snap-type: x proximity;
          -webkit-overflow-scrolling: touch;
          touch-action: pan-x;
        }

        .latest-arrivals-rack__viewport::-webkit-scrollbar {
          height: 8px;
        }

        .latest-arrivals-rack__viewport::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(213, 162, 78, 0.72), rgba(170, 120, 56, 0.72));
        }

        .latest-arrivals-rack__viewport::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.04);
          border-radius: 999px;
        }

        .latest-arrivals-rack__sleeve {
          scroll-snap-align: start;
          appearance: none;
          border: 0;
          border-radius: 10px 10px 4px 4px;
          padding: 0;
          width: 100%;
          height: 100%;
          min-height: 246px;
          background: transparent;
          cursor: pointer;
          transform: perspective(920px) rotate(var(--sleeve-tilt));
          transform-origin: bottom center;
          transition: transform 260ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 260ms ease;
          animation: latest-arrivals-rise 360ms var(--stagger-delay) both;
        }

        .latest-arrivals-rack__sleeve:hover,
        .latest-arrivals-rack__sleeve:focus-visible {
          transform: perspective(920px) translateY(-8px) rotate(var(--sleeve-tilt));
          outline: none;
        }

        .latest-arrivals-rack__sleeve.is-active {
          transform: perspective(920px) translateY(-10px) translateX(6px) scale(1.03) rotate(var(--sleeve-tilt));
        }

        .latest-arrivals-rack__sleeve-inner {
          display: grid;
          grid-template-rows: var(--sleeve-height) auto;
          height: 100%;
          border-radius: 10px 10px 4px 4px;
          overflow: hidden;
          background: linear-gradient(180deg, #f6e8cc, #dbc499 68%, #d1b98b);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.6),
            0 var(--sleeve-shadow) 16px rgba(0, 0, 0, 0.22);
          border: 1px solid rgba(94, 59, 30, 0.2);
        }

        .latest-arrivals-rack__sleeve-inner::after {
          content: "";
          position: absolute;
          width: 1px;
          top: 10px;
          bottom: 12px;
          right: -1px;
          background: linear-gradient(180deg, rgba(0, 0, 0, 0.18), rgba(0, 0, 0, 0.02));
        }

        .latest-arrivals-rack__sleeve-art {
          display: block;
          overflow: hidden;
          background:
            radial-gradient(circle at 20% 18%, rgba(255, 255, 255, 0.14), transparent 28%),
            linear-gradient(180deg, rgba(31, 22, 16, 0.98), rgba(23, 18, 14, 0.98));
        }

        .latest-arrivals-rack__image {
          width: 100%;
          height: 100%;
          display: block;
          object-fit: cover;
        }

        .latest-arrivals-rack__fallback-art {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: rgba(255, 242, 216, 0.8);
          font-family: "Fraunces", Georgia, serif;
          font-size: 22px;
          letter-spacing: 0.08em;
          background:
            radial-gradient(circle at 30% 18%, rgba(235, 186, 104, 0.24), transparent 34%),
            linear-gradient(160deg, rgba(79, 54, 33, 0.7), rgba(32, 24, 17, 0.8));
        }

        .latest-arrivals-rack__meta {
          display: grid;
          gap: 3px;
          padding: 10px 10px 12px;
        }

        .latest-arrivals-rack__album {
          display: block;
          color: rgba(44, 32, 22, 0.95);
          font-size: 12px;
          font-weight: 700;
          line-height: 1.25;
          max-height: 2.5em;
          overflow: hidden;
        }

        .latest-arrivals-rack__artist {
          display: block;
          color: rgba(61, 44, 31, 0.84);
          font-size: 11px;
          line-height: 1.2;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .latest-arrivals-rack__date {
          display: block;
          margin-top: 3px;
          color: rgba(118, 87, 59, 0.82);
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .latest-arrivals-rack__empty {
          margin: 0;
          color: rgba(241, 233, 218, 0.78);
          font-size: 14px;
        }

        @media (min-width: 700px) {
          .latest-arrivals-rack__viewport {
            grid-auto-columns: minmax(162px, 18vw);
            gap: 12px;
          }

          .latest-arrivals-rack__sleeve {
            min-height: 278px;
          }

          .latest-arrivals-rack__album {
            font-size: 13px;
          }

          .latest-arrivals-rack__artist {
            font-size: 12px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .latest-arrivals-rack__sleeve {
            transition: none;
            animation: none;
          }
        }

        @keyframes latest-arrivals-rise {
          from {
            opacity: 0;
            transform: perspective(920px) translateY(16px) rotate(var(--sleeve-tilt));
          }
          to {
            opacity: 1;
            transform: perspective(920px) rotate(var(--sleeve-tilt));
          }
        }
      `}</style>
    </section>
  );
}

export default LatestArrivalsRack;