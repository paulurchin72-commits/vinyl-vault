function BottomPlayer({ album, onOpenYouTubeMusic }) {
  const hasAlbum = Boolean(album);

  function handlePlay() {
    if (!album) {
      return;
    }

    if (onOpenYouTubeMusic) {
      onOpenYouTubeMusic(album.record || album);
      return;
    }

    const search = `${album.artist || ""} ${album.title || ""}`.trim();
    const encodedSearch = encodeURIComponent(search);
    window.open(`https://music.youtube.com/search?q=${encodedSearch}`, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="dashboard-player" aria-label="Playback bar">
      <div className="dashboard-player__meta">
        <div className="dashboard-player__badge">Now Spinning</div>
        <div>
          <p className="dashboard-player__artist">{album?.artist || "Select a record"}</p>
          <p className="dashboard-player__title">{album?.title || "Select an album to play on YouTube Music"}</p>
        </div>
      </div>

      <div className="dashboard-player__controls" aria-label="Playback controls">
        <button type="button" className="dashboard-player__control" disabled aria-label="Previous track unavailable">
          ⏮
        </button>
        <button
          type="button"
          className="dashboard-player__control dashboard-player__control--play"
          onClick={handlePlay}
          disabled={!hasAlbum}
          aria-label={hasAlbum ? "Play on YouTube Music" : "Play unavailable"}
          title={hasAlbum ? "Play on YouTube Music" : "Select an album first"}
        >
          ▶
        </button>
        <button type="button" className="dashboard-player__control" disabled aria-label="Next track unavailable">
          ⏭
        </button>
      </div>

      <div className="dashboard-player__progress" aria-hidden="true">
        <span className="dashboard-player__time">00:00</span>
        <div className="dashboard-player__track">
          <span className="dashboard-player__track-fill" />
        </div>
        <span className="dashboard-player__time">03:45</span>
      </div>
    </section>
  );
}

export default BottomPlayer;
