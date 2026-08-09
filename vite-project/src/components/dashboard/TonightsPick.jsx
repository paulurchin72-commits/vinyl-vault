import { useArtwork } from "../../artwork-v2/useArtwork";

function TonightsPick({ album, isFavorite, onOpenAlbum, onOpenYouTubeMusic, onToggleFavorite }) {
  const albumData = album
    ? {
        ...album,
        release_id: album.release_id || album.record?.release_id || null,
      }
    : { release_id: null };

  const { artworkUrl, loading, error } = useArtwork(albumData.release_id, {
    artist: album?.artist || album?.record?.Artist,
    title: album?.title || album?.record?.Title,
    year: album?.year || album?.record?.Released,
  });

  return (
    <section className="dashboard-panel dashboard-pick glass-panel" aria-label="Tonight's pick">
      <div className="dashboard-panel__heading">
        <div>
          <p className="dashboard-panel__eyebrow">Tonight's Pick</p>
          <h3 className="dashboard-panel__title">A random pull for tonight</h3>
        </div>
      </div>

      {album ? (
        <>
          <button type="button" className="dashboard-pick__art" onClick={() => onOpenAlbum(album.record)}>
            {loading ? (
              <div className="artwork-state artwork-state--loading" aria-label="Loading artwork">
                <span className="artwork-spinner" />
                <span className="artwork-state__label">Loading artwork</span>
              </div>
            ) : artworkUrl ? (
              <img
                src={artworkUrl}
                alt={album.title}
                className="dashboard-pick__image"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            ) : error ? (
              <div className="artwork-state artwork-state--placeholder" aria-label="No artwork available">
                <span className="artwork-state__monogram">M&amp;M</span>
                <span className="artwork-state__label">Music &amp; Memories</span>
              </div>
            ) : (
              <div className="artwork-state artwork-state--placeholder" aria-label="No artwork available">
                <span className="artwork-state__monogram">M&amp;M</span>
                <span className="artwork-state__label">Music &amp; Memories</span>
              </div>
            )}
          </button>
          <p className="dashboard-pick__artist">{album.artist}</p>
          <h4 className="dashboard-pick__title">{album.title}</h4>
          <p className="dashboard-pick__year">{album.year}</p>
          <div className="dashboard-pick__actions">
            <button type="button" className="collection-button" onClick={() => onOpenYouTubeMusic(album.record)}>
              ▶ Listen on YouTube Music
            </button>
            <button type="button" className="dashboard-pick__favorite" onClick={() => onToggleFavorite(album.record)}>
              {isFavorite ? "❤️ Favourite" : "🤍 Favourite"}
            </button>
          </div>
        </>
      ) : (
        <p className="dashboard-panel__empty">A random album will appear here when your collection loads.</p>
      )}
    </section>
  );
}

export default TonightsPick;
