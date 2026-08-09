import { NavLink } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/home", label: "🏠 Home" },
  { to: "/collection", label: "💿 Collection" },
  { to: "/artists", label: "🎤 Artists" },
  { to: "/favourites", label: "❤️ Favourites" },
  { to: "/top-rated", label: "⭐ Top Rated" },
  { to: "/insights", label: "📊 Insights" },
  { to: "/memories", label: "📝 Memories" },
  { to: "/settings", label: "⚙ Settings" },
];

function Sidebar({ logo }) {
  return (
    <aside className="dashboard-sidebar" aria-label="Dashboard sidebar">
      <div className="dashboard-sidebar__brand">
        <img src={logo} alt="Music and Memories" className="dashboard-sidebar__logo" />
        <div>
          <p className="dashboard-sidebar__eyebrow">Music &amp; Memories</p>
          <h2 className="dashboard-sidebar__title">Listening Room</h2>
        </div>
      </div>

      <nav className="dashboard-sidebar__nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `dashboard-sidebar__link${isActive ? " is-active" : ""}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

export default Sidebar;
