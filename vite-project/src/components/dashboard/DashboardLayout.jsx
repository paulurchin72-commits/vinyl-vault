import "./dashboard.css";

function DashboardLayout({ sidebar, hero, stats, continueListening, recentlyAdded, tonightsPick, randomMemory, bottomPlayer }) {
  const hasSidebar = Boolean(sidebar);

  return (
    <section className="dashboard-v2" aria-label="Music and Memories dashboard">
      <div className={`dashboard-v2__grid${hasSidebar ? "" : " dashboard-v2__grid--no-sidebar"}`}>
        {hasSidebar ? <div className="dashboard-v2__sidebar">{sidebar}</div> : null}
        <div className="dashboard-v2__main">
          <div className="dashboard-v2__hero">{hero}</div>
          <div className="dashboard-v2__stats">{stats}</div>
          <div className="dashboard-v2__row dashboard-v2__row--listening">{continueListening}</div>
          <div className="dashboard-v2__row dashboard-v2__row--recent">{recentlyAdded}</div>
          <div className="dashboard-v2__pick">{tonightsPick}</div>
          <div className="dashboard-v2__memory">{randomMemory}</div>
        </div>
      </div>
      <div className="dashboard-v2__player">{bottomPlayer}</div>
    </section>
  );
}

export default DashboardLayout;
