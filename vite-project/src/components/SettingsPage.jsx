import { useRef, useState } from "react";

function SettingsPage({
  backupSummary,
  onExportBackup,
  onImportBackup,
  onClearRecentlyViewed,
  onClearRollingStoneTracker,
  onForceRefreshApp,
}) {
  const importInputRef = useRef(null);
  const [statusMessage, setStatusMessage] = useState("");

  const summaryItems = [
    { label: "Added records", value: backupSummary?.addedRecords ?? 0 },
    { label: "Album notes", value: backupSummary?.albumNotes ?? 0 },
    { label: "Recently viewed", value: backupSummary?.recentlyViewed ?? 0 },
    { label: "Custom artwork", value: backupSummary?.customArtwork ?? 0 },
    { label: "Tracker entries", value: backupSummary?.rollingStoneEntries ?? 0 },
  ];

  function handleExportBackup() {
    const fileName = onExportBackup?.();
    if (fileName) {
      setStatusMessage(`Backup exported as ${fileName}.`);
    }
  }

  function handleChooseImport() {
    importInputRef.current?.click();
  }

  async function handleImportBackup(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const importMessage = await onImportBackup?.(file);
      setStatusMessage(importMessage || "Backup imported.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Failed to import backup.");
    }
  }

  function handleClearRecentlyViewed() {
    const message = onClearRecentlyViewed?.();
    setStatusMessage(message || "Recently viewed history cleared.");
  }

  function handleClearRollingStoneTracker() {
    const message = onClearRollingStoneTracker?.();
    setStatusMessage(message || "Rolling Stone tracker cleared.");
  }

  async function handleForceRefreshApp() {
    try {
      const message = await onForceRefreshApp?.();
      setStatusMessage(message || "Refreshing app...");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Unable to force refresh right now.");
    }
  }

  return (
    <section className="page-section settings-page" aria-label="Application settings and backups">
      <div className="section-heading">
        <p className="section-heading__eyebrow">Settings</p>
        <h2 className="section-heading__title">Backup &amp; Device Controls</h2>
      </div>

      <div className="glass-panel settings-page__panel">
        <div className="settings-page__panel-header">
          <div>
            <h3 className="settings-page__panel-title">Library Backup</h3>
            <p className="settings-page__panel-copy">
              Export your saved data to a JSON file, then import it on another device when needed.
            </p>
          </div>
        </div>

        <div className="settings-page__stats">
          {summaryItems.map((item) => (
            <article key={item.label} className="settings-page__stat glass-card">
              <p className="settings-page__stat-value">{item.value}</p>
              <p className="settings-page__stat-label">{item.label}</p>
            </article>
          ))}
        </div>

        <div className="settings-page__actions">
          <button type="button" className="album-modal__button album-modal__button--primary" onClick={handleExportBackup}>
            Export Backup
          </button>
          <button type="button" className="album-modal__button album-modal__button--secondary" onClick={handleChooseImport}>
            Import Backup
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="settings-page__file-input"
            onChange={handleImportBackup}
          />
        </div>
      </div>

      <div className="glass-panel settings-page__panel">
        <h3 className="settings-page__panel-title">Maintenance</h3>
        <p className="settings-page__panel-copy">
          Clean up device-specific activity without touching your main collection file.
        </p>

        <div className="settings-page__actions">
          <button type="button" className="album-modal__button album-modal__button--secondary" onClick={handleClearRecentlyViewed}>
            Clear Recently Viewed
          </button>
          <button type="button" className="album-modal__button album-modal__button--secondary" onClick={handleClearRollingStoneTracker}>
            Clear Top 500 Tracker
          </button>
        </div>

        <p className="settings-page__panel-copy">
          If this device keeps showing an older build, force a cache reset and reload.
        </p>

        <div className="settings-page__actions">
          <button
            type="button"
            className="album-modal__button album-modal__button--primary"
            onClick={handleForceRefreshApp}
          >
            Force Refresh App
          </button>
        </div>
      </div>

      {statusMessage ? <p className="status-message">{statusMessage}</p> : null}
    </section>
  );
}

export default SettingsPage;