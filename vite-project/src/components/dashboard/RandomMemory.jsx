function RandomMemory({ memoryEntry, onOpenAlbum, onArtistClick }) {
  return (
    <section className="dashboard-panel dashboard-memory glass-panel" aria-label="Random memory">
      <div className="dashboard-panel__heading">
        <div>
          <p className="dashboard-panel__eyebrow">Random Memory</p>
          <h3 className="dashboard-panel__title">A story from your collection</h3>
        </div>
      </div>

      {memoryEntry ? (
        <>
          <p className="dashboard-memory__artist">
            <button type="button" className="artist-link-button" onClick={() => onArtistClick(memoryEntry.record.Artist)}>
              {memoryEntry.record.Artist}
            </button>
          </p>
          <p className="dashboard-memory__album">{memoryEntry.title}</p>
          <p className="dashboard-memory__text">{memoryEntry.memory}</p>
          <button type="button" className="collection-button" onClick={() => onOpenAlbum(memoryEntry.record)}>
            Open Album
          </button>
        </>
      ) : (
        <p className="dashboard-panel__empty">Add memories to your albums and one will appear here.</p>
      )}
    </section>
  );
}

export default RandomMemory;
