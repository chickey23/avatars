import { useMemo, useState } from "react";
import type { ProjectMetadataRecord } from "../services/worldMetadata/types";
import type { UnmetNeedRemediation, UnmetNeedStatus } from "../services/unmetNeeds";
import {
  deleteUnmetNeed,
  listUnmetNeeds,
  updateUnmetNeed,
} from "../services/unmetNeeds";

const STATUSES: UnmetNeedStatus[] = [
  "open",
  "in_progress",
  "deferred",
  "done",
  "wontfix",
];
const REMEDIATIONS: UnmetNeedRemediation[] = [
  "new_source",
  "new_tool",
  "prompt_only",
  "investigate",
];

export type UnmetNeedsPanelProps = {
  tick: number;
  /** Bump parent hub tick so sibling tabs (e.g. Source) reload persisted data. */
  onHubDataChanged?: () => void;
  projectsList: [string, ProjectMetadataRecord][];
};

export function UnmetNeedsPanel({
  tick,
  onHubDataChanged,
  projectsList,
}: UnmetNeedsPanelProps) {
  const [localTick, setLocalTick] = useState(0);
  const items = useMemo(() => listUnmetNeeds(), [tick, localTick]);
  const refresh = () => {
    setLocalTick((n) => n + 1);
    onHubDataChanged?.();
  };

  return (
    <div className="unmet-needs-panel">
      <header className="tool-workshop-header">
        <h2 className="tool-workshop-title">Unmet Needs</h2>
        <p className="tool-workshop-sub">
          Queue of unsatisfied requests or capability gaps. Escalate from{" "}
          <strong>Workshops → Tool → Event log</strong>. Link optional world
          metadata projects (see <strong>Workshops → Projects</strong>).
        </p>
      </header>
      {items.length === 0 ? (
        <p className="tool-workshop-empty">No items yet.</p>
      ) : (
        <ul className="unmet-needs-list">
          {items.map((it) => (
            <li key={it.id} className="unmet-needs-card">
              <div className="unmet-needs-card-head">
                <input
                  className="unmet-needs-title-input"
                  value={it.title}
                  onChange={(e) => {
                    updateUnmetNeed(it.id, { title: e.target.value });
                    refresh();
                  }}
                  aria-label="Title"
                />
                <button
                  type="button"
                  className="tool-workshop-remove"
                  onClick={() => {
                    deleteUnmetNeed(it.id);
                    refresh();
                  }}
                >
                  Delete
                </button>
              </div>
              <div className="unmet-needs-grid">
                <label>
                  Status
                  <select
                    value={it.status}
                    onChange={(e) => {
                      updateUnmetNeed(it.id, {
                        status: e.target.value as UnmetNeedStatus,
                      });
                      refresh();
                    }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Remediation
                  <select
                    value={it.remediation}
                    onChange={(e) => {
                      updateUnmetNeed(it.id, {
                        remediation: e.target.value as UnmetNeedRemediation,
                      });
                      refresh();
                    }}
                  >
                    {REMEDIATIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="unmet-needs-span-2">
                  Related project (optional)
                  <select
                    value={it.relatedProjectId ?? ""}
                    onChange={(e) => {
                      updateUnmetNeed(it.id, {
                        relatedProjectId: e.target.value.trim() || undefined,
                      });
                      refresh();
                    }}
                    aria-label="Related world metadata project"
                  >
                    <option value="">— None —</option>
                    {it.relatedProjectId != null &&
                      !projectsList.some(([id]) => id === it.relatedProjectId) && (
                        <option value={it.relatedProjectId}>
                          {it.relatedProjectId} (missing from list)
                        </option>
                      )}
                    {projectsList.map(([id, proj]) => (
                      <option key={id} value={id}>
                        {proj.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {it.userPromptExcerpt && (
                <p className="unmet-needs-excerpt">
                  <strong>User excerpt:</strong> {it.userPromptExcerpt}
                </p>
              )}
              <label className="tool-workshop-label-block">
                Notes
                <textarea
                  className="tool-workshop-textarea"
                  rows={3}
                  value={it.notes ?? ""}
                  onChange={(e) => {
                    updateUnmetNeed(it.id, { notes: e.target.value });
                    refresh();
                  }}
                />
              </label>
              {it.linkedTelemetryEventIds.length > 0 && (
                <p className="unmet-needs-meta">
                  Telemetry:{" "}
                  {it.linkedTelemetryEventIds.map((id) => (
                    <code key={id} className="unmet-needs-code">
                      {id.slice(0, 8)}…
                    </code>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
