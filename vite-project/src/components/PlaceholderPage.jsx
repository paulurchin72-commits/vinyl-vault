function PlaceholderPage({ title, eyebrow, description }) {
  return (
    <section className="placeholder-page" aria-label={title}>
      <article className="glass-panel placeholder-page__panel">
        <div className="section-heading">
          <p className="section-heading__eyebrow">{eyebrow}</p>
          <h2 className="section-heading__title">{title}</h2>
        </div>
        <p className="placeholder-page__copy">{description}</p>
      </article>
    </section>
  );
}

export default PlaceholderPage;
