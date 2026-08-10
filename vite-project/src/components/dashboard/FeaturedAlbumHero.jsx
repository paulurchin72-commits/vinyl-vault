import { useArtwork } from "../../artwork-v2/useArtwork";

function FeaturedAlbumHero({ album, onOpenAlbum }) {
  const releaseId = album?.release_id || album?.record?.release_id || album?.record?.releaseId || null;
  const { artworkUrl, loading } = useArtwork(releaseId, {
    artist: album?.artist || album?.record?.Artist,
    title: album?.title || album?.record?.Title,
    year: album?.year || album?.record?.Released,
  });

  return (
    <div className="dashboard-featured-album" aria-label="Featured album artwork">
      <button
        type="button"
        className="dashboard-featured-album__button"
        onClick={() => {
          if (album?.record) {
            onOpenAlbum(album.record);
          }
        }}
        disabled={!album?.record}
      >
        {loading && !artworkUrl ? (
          <div className="artwork-state artwork-state--loading" aria-label="Loading artwork">
            <span className="artwork-spinner" />
            <span className="artwork-state__label">Loading artwork</span>
          </div>
        ) : artworkUrl ? (
          <img
            src={artworkUrl}
            alt={album?.title || "Featured album artwork"}
            className="dashboard-featured-album__image"
            loading="eager"
            decoding="async"
            fetchPriority="high"
          />
        ) : (
          <div className="artwork-state artwork-state--placeholder" aria-label="No artwork available">
            <span className="artwork-state__monogram">M&amp;M</span>
            <span className="artwork-state__label">Music &amp; Memories</span>
          </div>
        )}
      </button>

      <div className="dashboard-featured-album__meta">
        <p className="dashboard-featured-album__title">{album?.title || "Unknown Album"}</p>
        <p className="dashboard-featured-album__artist">{album?.artist || "Unknown Artist"}</p>
        <p className="dashboard-featured-album__year">{album?.year || "Unknown"}</p>
      </div>
    </div>
  );
}

export default FeaturedAlbumHero;
