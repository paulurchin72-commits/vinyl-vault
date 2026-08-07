function CollectionStats({ items }) {
  return (
    <section className="dashboard-stats" aria-label="Collection statistics">
      {items.map((item) => (
        <article key={item.label} className="dashboard-stat-card glass-card">
          <p className="dashboard-stat-card__label">{item.label}</p>
          <p className="dashboard-stat-card__value">{item.value}</p>
          <p className="dashboard-stat-card__hint">{item.hint}</p>
        </article>
      ))}
    </section>
  );
}

export default CollectionStats;
