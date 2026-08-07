import { useMemo } from "react";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildDuplicateGroups(records) {
  const groups = [];
  const releaseIdMap = new Map();
  const artistTitleMap = new Map();

  records.forEach((record) => {
    const releaseId = String(record.release_id || "").trim();
    if (releaseId) {
      if (!releaseIdMap.has(releaseId)) {
        releaseIdMap.set(releaseId, []);
      }
      releaseIdMap.get(releaseId).push(record);
    }

    const artistTitleKey = `${normalizeText(record.Artist)}::${normalizeText(record.Title)}`;
    if (artistTitleKey !== "::") {
      if (!artistTitleMap.has(artistTitleKey)) {
        artistTitleMap.set(artistTitleKey, []);
      }
      artistTitleMap.get(artistTitleKey).push(record);
    }
  });

  releaseIdMap.forEach((items, releaseId) => {
    if (items.length > 1) {
      groups.push({
        id: `release-${releaseId}`,
        type: "Same Discogs release",
        detail: `Release ID ${releaseId}`,
        records: items,
      });
    }
  });

  artistTitleMap.forEach((items, key) => {
    if (items.length > 1) {
      const allSameRelease = items.every((record) => String(record.release_id || "").trim())
        && new Set(items.map((record) => String(record.release_id || "").trim())).size === 1;

      if (!allSameRelease) {
        groups.push({
          id: `artist-title-${key}`,
          type: "Same artist and album title",
          detail: "Possible duplicate or alternate edition",
          records: items,
        });
      }
    }
  });

  return groups.sort((firstGroup, secondGroup) => {
    const firstRecord = firstGroup.records[0] || {};
    const secondRecord = secondGroup.records[0] || {};
    return `${firstRecord.Artist || ""}${firstRecord.Title || ""}`.localeCompare(
      `${secondRecord.Artist || ""}${secondRecord.Title || ""}`
    );
  });
}

function DuplicateDetectorPage({ records, onOpenAlbum }) {
  const duplicateGroups = useMemo(() => buildDuplicateGroups(records), [records]);

  return (
    <section className="duplicate-detector-page" aria-label="Duplicate detector">
      <article className="glass-panel duplicate-detector-page__panel">
        <div className="section-heading">
          <p className="section-heading__eyebrow">Collection Maintenance</p>
          <h2 className="section-heading__title">🧬 Duplicate Detector</h2>
        </div>

        <p className="duplicate-detector-page__copy">
          Review likely duplicate releases in your collection. Groups are flagged by matching Discogs release ID or matching artist and album title.
        </p>

        {duplicateGroups.length ? (
          <div className="duplicate-detector-page__groups">
            {duplicateGroups.map((group) => (
              <article key={group.id} className="glass-panel duplicate-detector-page__group">
                <div className="duplicate-detector-page__group-header">
                  <div>
                    <p className="duplicate-detector-page__group-type">{group.type}</p>
                    <h3 className="duplicate-detector-page__group-title">
                      {group.records[0]?.Artist || "Unknown Artist"} - {group.records[0]?.Title || "Unknown Album"}
                    </h3>
                    <p className="duplicate-detector-page__group-detail">{group.detail}</p>
                  </div>
                  <p className="duplicate-detector-page__group-count">{group.records.length} matches</p>
                </div>

                <ul className="duplicate-detector-page__record-list">
                  {group.records.map((record, index) => (
                    <li key={`${group.id}-${record.release_id || record.Title}-${index}`} className="duplicate-detector-page__record-item">
                      <div>
                        <p className="duplicate-detector-page__record-meta">
                          {record.Released || "Unknown"}
                          {record.release_id ? ` • Release ID ${record.release_id}` : ""}
                          {record.Label ? ` • ${record.Label}` : ""}
                        </p>
                        <p className="duplicate-detector-page__record-format">{record.Format || "Format unknown"}</p>
                      </div>
                      <button type="button" className="collection-button" onClick={() => onOpenAlbum(record)}>
                        Open Album
                      </button>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <p className="empty-state">No likely duplicates found in the current collection data.</p>
        )}
      </article>
    </section>
  );
}

export default DuplicateDetectorPage;