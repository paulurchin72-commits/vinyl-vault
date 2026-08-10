import { useArtwork } from "../../artwork-v2/useArtwork";

function RecentlyAddedCard({ album, onSelect }) {
  const releaseId = album.release_id || album.record?.release_id || album.record?.releaseId || null;
  const { artworkUrl, loading } = useArtwork(releaseId, {
    artist: album.artist || album.record?.Artist,
    title: album.title || album.record?.Title,
    year: album.year || album.record?.Released,
  });

  return (
    <article className="dashboard-carousel-card">
      <button type="button" className="dashboard-carousel-card__art" onClick={() => onSelect(album)}>
        {loading && !artworkUrl ? (
          <div className="artwork-state artwork-state--loading" aria-label="Loading artwork">
            <span className="artwork-spinner" />
            <span className="artwork-state__label">Loading artwork</span>
          </div>
        ) : artworkUrl ? (
          <img
            src={artworkUrl}
            alt={album.title}
            className="dashboard-carousel-card__image"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className="artwork-state artwork-state--placeholder" aria-label="No artwork available">
            <span className="artwork-state__monogram">M&amp;M</span>
            <span className="artwork-state__label">Music &amp; Memories</span>
          </div>
        )}
      </button>
      <div className="dashboard-carousel-card__body">
        <p className="dashboard-carousel-card__artist">{album.artist}</p>
        <p className="dashboard-carousel-card__title">{album.title}</p>
      </div>
    </article>
  );
}

function RecentlyAdded({ albums, onSelect }) {
  return (
    <section className="dashboard-panel glass-panel" aria-label="Recently added albums">
      <div className="dashboard-panel__heading">
        <div>
          <p className="dashboard-panel__eyebrow">Recently Added</p>
          <h3 className="dashboard-panel__title">Fresh arrivals for your shelves</h3>
        </div>
      </div>

      {albums.length ? (
        <div className="dashboard-carousel">
          {albums.map((album) => (
            <RecentlyAddedCard
              key={`${album.release_id || album.record?.release_id || album.title}-${album.artist}`}
              album={album}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <p className="dashboard-panel__empty">New additions will appear here as your collection grows.</p>
      )}
    </section>
  );
}

export default RecentlyAdded;
