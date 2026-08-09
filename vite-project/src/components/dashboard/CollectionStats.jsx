function CollectionStats({ items }) {
  return (
    <section className="dashboard-stats" aria-label="Collection statistics">
      {items.map((item) => (
        item.onClick ? (
          <button
            key={item.label}
            type="button"
            className="dashboard-stat-card dashboard-stat-card--button glass-card"
            onClick={item.onClick}
            aria-label={`${item.label}: ${item.value}. ${item.hint}`}
          >
            <p className="dashboard-stat-card__label">{item.label}</p>
            <p className="dashboard-stat-card__value">{item.value}</p>
            <p className="dashboard-stat-card__hint">{item.hint}</p>
          </button>
        ) : (
          <article key={item.label} className="dashboard-stat-card glass-card">
            <p className="dashboard-stat-card__label">{item.label}</p>
            <p className="dashboard-stat-card__value">{item.value}</p>
            <p className="dashboard-stat-card__hint">{item.hint}</p>
          </article>
        )
      ))}
    </section>
  );
}

export default CollectionStats;
