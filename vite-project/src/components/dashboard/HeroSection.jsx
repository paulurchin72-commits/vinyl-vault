function HeroSection({ greeting, name, subtitle, actions, extra }) {
  return (
    <section className="dashboard-hero glass-panel">
      <div className="dashboard-hero__copy">
        <p className="dashboard-hero__eyebrow">{greeting}</p>
        <h2 className="dashboard-hero__title">{name}</h2>
        {subtitle ? <p className="dashboard-hero__subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="dashboard-hero__actions" aria-label="Dashboard quick actions">{actions}</div> : null}
      {extra ? <div className="dashboard-hero__extra">{extra}</div> : null}
    </section>
  );
}

export default HeroSection;
