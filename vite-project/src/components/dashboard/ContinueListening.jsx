import { useArtwork } from "../../artwork-v2/useArtwork";

function ContinueListeningCard({ album, onSelect, onArtistClick }) {
  const releaseId = album.release_id || album.record?.release_id || album.record?.releaseId || null;
  const storedArtworkUrl = album.artworkUrl || album.cover || album.thumb || album.record?.artworkUrl || album.record?.cover || album.record?.thumb || null;
  const { artworkUrl, loading } = useArtwork(releaseId, {
    artist: album.artist || album.record?.Artist,
    title: album.title || album.record?.Title,
    year: album.year || album.record?.Released,
  });
  const displayArtworkUrl = artworkUrl || storedArtworkUrl;

  return (
    <article className="dashboard-carousel-card">
      <button type="button" className="dashboard-carousel-card__art" onClick={() => onSelect(album.record)}>
        {loading && !displayArtworkUrl ? (
          <div className="artwork-state artwork-state--loading" aria-label="Loading artwork">
            <span className="artwork-spinner" />
            <span className="artwork-state__label">Loading artwork</span>
          </div>
        ) : displayArtworkUrl ? (
          <img
            src={displayArtworkUrl}
            alt={album.title || "Album artwork"}
            className="dashboard-carousel-card__image"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="artwork-state artwork-state--placeholder" aria-label="No artwork available">
            <span className="artwork-state__label">Artwork unavailable</span>
          </div>
        )}
      </button>
      <div className="dashboard-carousel-card__body">
        <button type="button" className="artist-link-button" onClick={() => onArtistClick(album.artist)}>
          {album.artist || "Unknown Artist"}
        </button>
        <p className="dashboard-carousel-card__title">{album.title || "Unknown Album"}</p>
      </div>
    </article>
  );
}

function ContinueListening({ albums, onSelect, onArtistClick }) {
  return (
    <section className="dashboard-panel glass-panel" aria-label="Continue listening">
      <div className="dashboard-panel__heading">
        <div>
          <p className="dashboard-panel__eyebrow">Continue Listening</p>
          <h3 className="dashboard-panel__title">Pick up where you left off</h3>
        </div>
      </div>

      {albums.length ? (
        <div className="dashboard-carousel">
          {albums.map((album) => (
            <ContinueListeningCard
              key={`${album.albumKey || album.release_id || album.title}-${album.artist}`}
              album={album}
              onSelect={onSelect}
              onArtistClick={onArtistClick}
            />
          ))}
        </div>
      ) : (
        <p className="dashboard-panel__empty">Open albums to build your listening queue.</p>
      )}
    </section>
  );
}

export default ContinueListening;
