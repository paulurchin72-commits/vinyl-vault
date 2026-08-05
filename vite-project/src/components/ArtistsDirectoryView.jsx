function ArtistsDirectoryView({ records, onArtistClick }) {
  const artistCounts = records.reduce((counts, record) => {
    const artist = record.Artist || "Unknown Artist";
    counts.set(artist, (counts.get(artist) || 0) + 1);
    return counts;
  }, new Map());

  const artists = Array.from(artistCounts.entries())
    .map(([name, albumCount]) => ({ name, albumCount }))
    .sort((firstArtist, secondArtist) => {
      if (secondArtist.albumCount !== firstArtist.albumCount) {
        return secondArtist.albumCount - firstArtist.albumCount;
      }

      return firstArtist.name.localeCompare(secondArtist.name);
    });

  return (
    <section className="artists-directory" aria-label="Artists directory">
      <div className="glass-panel artists-directory__header">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Browse Artists</p>
          <h2 className="section-heading__title">🎤 Artists</h2>
        </div>
        <p className="artists-directory__summary">
          {artists.length} artists represented across {records.length} records.
        </p>
      </div>

      <ul className="artists-directory__grid">
        {artists.map((artist) => (
          <li key={artist.name}>
            <button
              type="button"
              className="glass-card artists-directory__card"
              onClick={() => onArtistClick(artist.name)}
            >
              <p className="artists-directory__name">{artist.name}</p>
              <p className="artists-directory__count">
                {artist.albumCount} {artist.albumCount === 1 ? "album" : "albums"}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default ArtistsDirectoryView;
