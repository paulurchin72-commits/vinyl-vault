function normalizeListValues(rawValue) {
  if (!rawValue) {
    return [];
  }

  if (Array.isArray(rawValue)) {
    return rawValue
      .map((value) => String(value).trim())
      .filter(Boolean);
  }

  return String(rawValue)
    .split(/[,&/]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function toChartData(entries, limit = 10) {
  const sortedEntries = Array.from(entries.entries()).sort(
    (firstEntry, secondEntry) => secondEntry[1] - firstEntry[1]
  );

  const limitedEntries = sortedEntries.slice(0, limit);
  const highestValue = limitedEntries[0]?.[1] || 1;

  return limitedEntries.map(([label, value]) => ({
    label,
    value,
    width: (value / highestValue) * 100,
  }));
}

function CollectionInsightsView({
  records,
  savedAlbumDetails,
  getAlbumKey,
  getArtworkEntry,
  onArtistClick,
  onBackToCollection,
}) {
  const artistCounts = new Map();
  const decadeCounts = new Map();
  const genreCounts = new Map();
  const formatCounts = new Map();
  const artistRatings = new Map();
  const artistFavorites = new Map();

  let favoriteRecords = 0;
  let memoriesWritten = 0;
  let ratingTotal = 0;
  let ratingCount = 0;

  records.forEach((record) => {
    const albumKey = getAlbumKey(record);
    const savedDetails = savedAlbumDetails[albumKey] || {};
    const artist = record.Artist || "Unknown Artist";

    artistCounts.set(artist, (artistCounts.get(artist) || 0) + 1);

    const releaseYear = Number(record.Released);
    if (Number.isFinite(releaseYear) && releaseYear > 0) {
      const decade = `${Math.floor(releaseYear / 10) * 10}s`;
      decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
    } else {
      decadeCounts.set("Unknown", (decadeCounts.get("Unknown") || 0) + 1);
    }

    const artworkEntry = getArtworkEntry(record);
    const albumGenres = normalizeListValues(
      artworkEntry.releaseData?.genres || record.Genre || record.genres || "Unknown"
    );
    const albumFormats = normalizeListValues(record.Format || "Unknown");

    albumGenres.forEach((genre) => {
      genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
    });

    albumFormats.forEach((format) => {
      formatCounts.set(format, (formatCounts.get(format) || 0) + 1);
    });

    if (savedDetails.favorite) {
      favoriteRecords += 1;
      artistFavorites.set(artist, (artistFavorites.get(artist) || 0) + 1);
    }

    if (savedDetails.memory?.trim()) {
      memoriesWritten += 1;
    }

    if (savedDetails.rating) {
      const numericRating = Number(savedDetails.rating);
      if (Number.isFinite(numericRating)) {
        ratingTotal += numericRating;
        ratingCount += 1;

        const artistRating = artistRatings.get(artist) || { total: 0, count: 0 };
        artistRatings.set(artist, {
          total: artistRating.total + numericRating,
          count: artistRating.count + 1,
        });
      }
    }
  });

  const averageRating = ratingCount ? (ratingTotal / ratingCount).toFixed(1) : "N/A";
  const topCollectedArtists = toChartData(artistCounts, 10);

  const decadeChartData = toChartData(decadeCounts, 12).sort((firstEntry, secondEntry) => {
    if (firstEntry.label === "Unknown") {
      return 1;
    }
    if (secondEntry.label === "Unknown") {
      return -1;
    }

    return Number(firstEntry.label.slice(0, 4)) - Number(secondEntry.label.slice(0, 4));
  });

  const genreChartData = toChartData(genreCounts, 10);
  const formatChartData = toChartData(formatCounts, 10);

  const highestRatedArtists = Array.from(artistRatings.entries())
    .map(([artist, values]) => ({
      artist,
      averageRating: values.total / values.count,
      ratedAlbums: values.count,
    }))
    .sort((firstArtist, secondArtist) => {
      if (secondArtist.averageRating !== firstArtist.averageRating) {
        return secondArtist.averageRating - firstArtist.averageRating;
      }

      return secondArtist.ratedAlbums - firstArtist.ratedAlbums;
    })
    .slice(0, 10);

  const mostLovedArtistEntry = Array.from(artistFavorites.entries()).sort(
    (firstEntry, secondEntry) => secondEntry[1] - firstEntry[1]
  )[0];

  const mostLovedArtist = mostLovedArtistEntry
    ? { artist: mostLovedArtistEntry[0], favorites: mostLovedArtistEntry[1] }
    : null;

  return (
    <section className="insights-view" aria-label="Collection insights">
      <div className="insights-view__header glass-panel">
        <div className="insights-view__header-row">
          <div className="section-heading">
            <p className="section-heading__eyebrow">Collection Intelligence</p>
            <h2 className="section-heading__title">📊 Collection Insights</h2>
          </div>

          <button type="button" className="insights-view__back" onClick={onBackToCollection}>
            ← Back to Collection
          </button>
        </div>

        <div className="insights-summary-grid">
          <article className="glass-card insights-summary-card">
            <p className="insights-summary-card__label">📀 Total Records</p>
            <p className="insights-summary-card__value">{records.length}</p>
          </article>
          <article className="glass-card insights-summary-card">
            <p className="insights-summary-card__label">❤️ Favourite Records</p>
            <p className="insights-summary-card__value">{favoriteRecords}</p>
          </article>
          <article className="glass-card insights-summary-card">
            <p className="insights-summary-card__label">⭐ Average Rating</p>
            <p className="insights-summary-card__value">{averageRating}</p>
          </article>
          <article className="glass-card insights-summary-card">
            <p className="insights-summary-card__label">📝 Memories Written</p>
            <p className="insights-summary-card__value">{memoriesWritten}</p>
          </article>
        </div>
      </div>

      <div className="insights-grid">
        <article className="glass-panel insights-card">
          <h3 className="insights-card__title">🎤 Top 10 Most Collected Artists</h3>
          <ul className="insights-chart-list">
            {topCollectedArtists.map((entry) => (
              <li key={entry.label} className="insights-chart-row">
                <button
                  type="button"
                  className="artist-link-button insights-chart-row__label"
                  onClick={() => onArtistClick(entry.label)}
                >
                  {entry.label}
                </button>
                <div className="insights-chart-row__track" aria-hidden="true">
                  <span
                    className="insights-chart-row__bar"
                    style={{ width: `${entry.width}%` }}
                  />
                </div>
                <span className="insights-chart-row__value">{entry.value}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="glass-panel insights-card">
          <h3 className="insights-card__title">📅 Collection by Decade</h3>
          <ul className="insights-chart-list">
            {decadeChartData.map((entry) => (
              <li key={entry.label} className="insights-chart-row">
                <span className="insights-chart-row__label">{entry.label}</span>
                <div className="insights-chart-row__track" aria-hidden="true">
                  <span
                    className="insights-chart-row__bar"
                    style={{ width: `${entry.width}%` }}
                  />
                </div>
                <span className="insights-chart-row__value">{entry.value}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="glass-panel insights-card">
          <h3 className="insights-card__title">🎵 Collection by Genre</h3>
          <ul className="insights-chart-list">
            {genreChartData.map((entry) => (
              <li key={entry.label} className="insights-chart-row">
                <span className="insights-chart-row__label">{entry.label}</span>
                <div className="insights-chart-row__track" aria-hidden="true">
                  <span
                    className="insights-chart-row__bar"
                    style={{ width: `${entry.width}%` }}
                  />
                </div>
                <span className="insights-chart-row__value">{entry.value}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="glass-panel insights-card">
          <h3 className="insights-card__title">💿 Collection by Format</h3>
          <ul className="insights-chart-list">
            {formatChartData.map((entry) => (
              <li key={entry.label} className="insights-chart-row">
                <span className="insights-chart-row__label">{entry.label}</span>
                <div className="insights-chart-row__track" aria-hidden="true">
                  <span
                    className="insights-chart-row__bar"
                    style={{ width: `${entry.width}%` }}
                  />
                </div>
                <span className="insights-chart-row__value">{entry.value}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="glass-panel insights-card insights-card--wide">
          <h3 className="insights-card__title">🏆 Highest Rated Artists</h3>
          <ul className="highest-rated-list">
            {highestRatedArtists.length ? (
              highestRatedArtists.map((entry) => (
                <li key={entry.artist} className="highest-rated-list__row">
                  <button
                    type="button"
                    className="artist-link-button highest-rated-list__artist"
                    onClick={() => onArtistClick(entry.artist)}
                  >
                    {entry.artist}
                  </button>
                  <span className="highest-rated-list__meta">
                    {entry.averageRating.toFixed(1)} avg ({entry.ratedAlbums} rated)
                  </span>
                </li>
              ))
            ) : (
              <li className="highest-rated-list__empty">Rate some albums to populate this list.</li>
            )}
          </ul>
        </article>

        <article className="glass-panel insights-card insights-card--wide">
          <h3 className="insights-card__title">❤️ Most Loved Artist</h3>
          {mostLovedArtist ? (
            <p className="most-loved-copy">
              <button
                type="button"
                className="artist-link-button most-loved-copy__artist"
                onClick={() => onArtistClick(mostLovedArtist.artist)}
              >
                {mostLovedArtist.artist}
              </button>
              {` has ${mostLovedArtist.favorites} favourite ${
                mostLovedArtist.favorites === 1 ? "record" : "records"
              } in your collection.`}
            </p>
          ) : (
            <p className="most-loved-copy">Mark albums as favourites to discover your most loved artist.</p>
          )}
        </article>
      </div>
    </section>
  );
}

export default CollectionInsightsView;
