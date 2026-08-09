function CollectionOverview({ items }) {
  return (
    <section className="dashboard-panel dashboard-overview glass-panel" aria-label="Collection overview">
      <div className="dashboard-panel__heading">
        <div>
          <p className="dashboard-panel__eyebrow">Collection Overview</p>
          <h3 className="dashboard-panel__title">Your archive at a glance</h3>
        </div>
      </div>

      <div className="dashboard-overview__chart" aria-hidden="true">
        <div className="dashboard-overview__ring">
          <div className="dashboard-overview__core">
            <span>Archive</span>
          </div>
        </div>
      </div>

      <div className="dashboard-overview__legend">
        {items.map((item) => (
          <div key={item.label} className="dashboard-overview__legend-item">
            <span className="dashboard-overview__swatch" style={{ background: item.color }} />
            <div>
              <p className="dashboard-overview__legend-label">{item.label}</p>
              <p className="dashboard-overview__legend-value">{item.value}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default CollectionOverview;
