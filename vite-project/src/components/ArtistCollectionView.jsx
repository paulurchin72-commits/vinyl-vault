import { useMemo, useState } from "react";
import AlbumCard from "./AlbumCard";

function ArtistCollectionView({
  artistName,
  records,
  savedAlbumDetails,
  getAlbumKey,
  getRecordListKey,
  getArtworkEntry,
  onAlbumOpen,
  onBack,
  onArtistClick,
}) {
  const [artistSearch, setArtistSearch] = useState("");

  const artistRecords = useMemo(
    () => records.filter((record) => record.Artist === artistName),
    [records, artistName]
  );

  const artistSearchQuery = artistSearch.toLowerCase();
  const filteredArtistRecords = artistRecords.filter((record) =>
    `${record.Artist} ${record.Title}`.toLowerCase().includes(artistSearchQuery)
  );

  const artistStats = useMemo(() => {
    let favorites = 0;
    let memoryCount = 0;
    let ratingTotal = 0;
    let ratingCount = 0;

    artistRecords.forEach((record) => {
      const albumKey = getAlbumKey(record);
      const savedDetails = savedAlbumDetails[albumKey] || {};

      if (savedDetails.favorite) {
        favorites += 1;
      }

      if (savedDetails.memory?.trim()) {
        memoryCount += 1;
      }

      if (savedDetails.rating) {
        ratingTotal += Number(savedDetails.rating);
        ratingCount += 1;
      }
    });

    return {
      albumCount: artistRecords.length,
      favorites,
      memoryCount,
      averageRating: ratingCount ? (ratingTotal / ratingCount).toFixed(1) : "N/A",
    };
  }, [artistRecords, getAlbumKey, savedAlbumDetails]);

  return (
    <section className="artist-view" aria-label="Artist collection view">
      <div className="artist-view__header glass-panel">
        <div className="artist-view__header-row">
          <button type="button" className="artist-view__back" onClick={onBack}>
            ← Back to Artists
          </button>
        </div>

        <div className="section-heading">
          <p className="section-heading__eyebrow">Artist Collection</p>
          <h2 className="section-heading__title">{artistName}</h2>
        </div>

        <div className="artist-stats-grid">
          <article className="glass-card artist-stat-card">
            <p className="artist-stat-card__label">Albums Owned</p>
            <p className="artist-stat-card__value">{artistStats.albumCount}</p>
          </article>
          <article className="glass-card artist-stat-card">
            <p className="artist-stat-card__label">Average Rating</p>
            <p className="artist-stat-card__value">{artistStats.averageRating}</p>
          </article>
          <article className="glass-card artist-stat-card">
            <p className="artist-stat-card__label">Favourites</p>
            <p className="artist-stat-card__value">{artistStats.favorites}</p>
          </article>
          <article className="glass-card artist-stat-card">
            <p className="artist-stat-card__label">Memories Written</p>
            <p className="artist-stat-card__value">{artistStats.memoryCount}</p>
          </article>
        </div>
      </div>

      <div className="app-toolbar app-toolbar--search artist-view__search">
        <input
          type="text"
          placeholder="🔍 Search this artist's albums..."
          value={artistSearch}
          onChange={(event) => setArtistSearch(event.target.value)}
          className="collection-search"
        />
      </div>

      <div className="results-row">
        <h3 className="results-row__title">
          {filteredArtistRecords.length} of {artistRecords.length} {artistRecords.length === 1 ? "Album" : "Albums"}
        </h3>
        <p className="results-row__hint">Artist spotlight view</p>
      </div>

      <ul className="collection-grid">
        {filteredArtistRecords.map((record) => {
          const albumKey = getAlbumKey(record);
          const savedDetails = savedAlbumDetails[albumKey] || {};

          return (
            <AlbumCard
              key={getRecordListKey(record)}
              record={record}
              onClick={onAlbumOpen}
              onArtistClick={onArtistClick}
              favorite={savedDetails.favorite}
              rating={savedDetails.rating}
              cover={getArtworkEntry(record).coverUrl}
              artworkStatus={getArtworkEntry(record).status}
            />
          );
        })}
      </ul>
    </section>
  );
}

export default ArtistCollectionView;
