import { useCallback, useMemo, useState } from "react";
import type { OllamaPresence } from "../services/ollama";
import {
  computeToolIntentCorrectness,
  computeToolIntentCorrectnessByAvatar,
  computeToolTelemetryAggregates,
  isPermissionErrorCode,
  loadToolTelemetryFromStorage,
  sortToolTelemetryEventsForDisplay,
} from "../services/toolTelemetry";
import {
  approveToolWorkshopProposal,
  DEFAULT_TOOL_WORKSHOP_SETTINGS,
  loadToolWorkshopDoc,
  REFINER_SYSTEM_DEFAULT,
  rejectToolWorkshopProposal,
  removeAddendum,
  runToolWorkshopRefiner,
  saveToolWorkshopDoc,
  setAddendumActive,
  updateToolWorkshopSettings,
} from "../services/toolWorkshop";
import type { ToolWorkshopProposal } from "../services/toolWorkshop";
import type { ToolTelemetryEvent } from "../services/toolTelemetry/types";
import type { ProjectMetadataRecord } from "../services/worldMetadata/types";
import {
  createUnmetNeedFromTelemetryEvent,
  suggestRelatedProjectIdFromTelemetryEvent,
  suggestUnmetNeedTitleFromTelemetryEvent,
} from "../services/unmetNeeds";

type TabId = "overview" | "events" | "refiner" | "proposals" | "active";

export type ToolWorkshopPanelProps = {
  ollamaPresence: "checking" | OllamaPresence;
  onRefreshOllama: () => void;
  /** Resolve user message text for escalation (optional excerpt). */
  resolveUserMessagePreview?: (userMessageId: string) => string | undefined;
  /** After persisting unmet needs or related data from this panel. */
  onDataChanged?: () => void;
  /** World metadata projects for escalation / linking (sorted list). */
  projectsList?: [string, ProjectMetadataRecord][];
};

export function ToolWorkshopPanel({
  ollamaPresence,
  onRefreshOllama,
  resolveUserMessagePreview,
  onDataChanged,
  projectsList = [],
}: ToolWorkshopPanelProps) {
  const [tab, setTab] = useState<TabId>("overview");
  const [tick, setTick] = useState(0);
  const [refinerBusy, setRefinerBusy] = useState(false);
  const [refinerMessage, setRefinerMessage] = useState<string | null>(null);
  const [escalateForm, setEscalateForm] = useState<{
    event: ToolTelemetryEvent;
    title: string;
    relatedProjectId: string;
  } | null>(null);

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  const telemetry = useMemo(() => loadToolTelemetryFromStorage(), [tick]);
  const workshop = useMemo(() => loadToolWorkshopDoc(), [tick]);
  const aggregates = useMemo(
    () => computeToolTelemetryAggregates(telemetry.events),
    [telemetry.events]
  );
  const intentCorrectness = useMemo(
    () => computeToolIntentCorrectness(telemetry.events),
    [telemetry.events]
  );
  const intentByAvatar = useMemo(
    () => computeToolIntentCorrectnessByAvatar(telemetry.events),
    [telemetry.events]
  );
  const eventsDisplay = useMemo(
    () => sortToolTelemetryEventsForDisplay(telemetry.events),
    [telemetry.events]
  );

  const aggSorted = useMemo(() => {
    return [...aggregates].sort((a, b) => {
      const atDelta = (b.lastEventAt ?? 0) - (a.lastEventAt ?? 0);
      if (atDelta !== 0) return atDelta;
      return (b.failureCount + b.successCount) - (a.failureCount + a.successCount);
    });
  }, [aggregates]);

  const formatEventDateTime = (at: number) => new Date(at).toLocaleString();

  const onApprove = (p: ToolWorkshopProposal) => {
    const r = approveToolWorkshopProposal(p);
    if (!r.ok) {
      setRefinerMessage(r.error);
      return;
    }
    setRefinerMessage(
      r.warnings.length ? r.warnings.join(" ") : "Approved and merged into prompts."
    );
    refresh();
  };

  const onReject = (id: string) => {
    rejectToolWorkshopProposal(id);
    refresh();
  };

  const openEscalateForm = (e: ToolTelemetryEvent) => {
    setEscalateForm({
      event: e,
      title: suggestUnmetNeedTitleFromTelemetryEvent(e),
      relatedProjectId: suggestRelatedProjectIdFromTelemetryEvent(e) ?? "",
    });
  };

  const submitEscalateForm = () => {
    if (!escalateForm) return;
    const e = escalateForm.event;
    const excerpt =
      e.userMessageId != null
        ? resolveUserMessagePreview?.(e.userMessageId)?.slice(0, 2000)
        : undefined;
    createUnmetNeedFromTelemetryEvent(e, {
      title: escalateForm.title.trim() || undefined,
      relatedProjectId: escalateForm.relatedProjectId.trim() || undefined,
      userPromptExcerpt: excerpt,
    });
    setEscalateForm(null);
    onDataChanged?.();
    setRefinerMessage("Added to Unmet Needs (Workshops → Unmet Needs).");
    window.setTimeout(() => setRefinerMessage(null), 5000);
  };

  const onRunRefiner = async () => {
    if (ollamaPresence !== "ready") {
      setRefinerMessage("Ollama must be ready to run the refiner.");
      return;
    }
    setRefinerBusy(true);
    setRefinerMessage(null);
    try {
      const out = await runToolWorkshopRefiner();
      if (!out.ok) {
        setRefinerMessage(out.error);
      } else {
        setRefinerMessage(`Proposal created (${out.proposal.items.length} items). Review in Pending.`);
        setTab("proposals");
      }
      refresh();
    } finally {
      setRefinerBusy(false);
    }
  };

  const settings = workshop.settings;

  return (
    <div className="tool-workshop-panel">
      <header className="tool-workshop-header">
        <h2 className="tool-workshop-title">Tool Workshop</h2>
        <p className="tool-workshop-sub">
          Telemetry from avatar tool calls, optional refiner proposals, and
          user-approved prompt addenda (merged after static tool instructions).
        </p>
      </header>

      <nav className="tool-workshop-tabs" aria-label="Workshop sections">
        {(
          [
            ["overview", "Overview"],
            ["events", "Event log"],
            ["refiner", "Refiner"],
            ["proposals", "Pending proposals"],
            ["active", "Active guidance"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`tool-workshop-tab${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {refinerMessage && (
        <p className="tool-workshop-flash" role="status">
          {refinerMessage}
        </p>
      )}

      {tab === "overview" && (
        <section className="tool-workshop-section">
          <h3>Aggregates</h3>
          {intentCorrectness.total > 0 ? (
            <p className="tool-workshop-hint" role="status">
              Intent match (successful tool vs detected user intent):{" "}
              {intentCorrectness.correct}/{intentCorrectness.total} (
              {Math.round((100 * intentCorrectness.correct) / intentCorrectness.total)}%)
            </p>
          ) : (
            <p className="tool-workshop-hint">
              No intent-labeled successes yet (turns with a detected intent and a successful tool).
            </p>
          )}
          {intentByAvatar.length > 0 ? (
            <div className="tool-workshop-intent-by-avatar">
              <h4 className="tool-workshop-subheading">Intent match by avatar</h4>
              <table className="tool-workshop-table tool-workshop-table--compact">
                <thead>
                  <tr>
                    <th>Avatar</th>
                    <th>Matched</th>
                    <th>Total</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {intentByAvatar.map((row) => (
                    <tr key={row.avatarId}>
                      <td>{row.avatarId}</td>
                      <td>{row.correct}</td>
                      <td>{row.total}</td>
                      <td>
                        {row.total > 0
                          ? Math.round((100 * row.correct) / row.total)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <p className="tool-workshop-hint">
            Rows are ordered by newest event time.
          </p>
          {aggSorted.length === 0 ? (
            <p className="tool-workshop-empty">No telemetry yet.</p>
          ) : (
            <table className="tool-workshop-table">
              <thead>
                <tr>
                  <th aria-hidden />
                  <th>Date / time</th>
                  <th>Tool</th>
                  <th>Avatar</th>
                  <th>Error</th>
                  <th>OK</th>
                  <th>Fail</th>
                  <th>Preview</th>
                </tr>
              </thead>
              <tbody>
                {aggSorted.map((r, i) => (
                  <tr key={`${r.toolId}-${r.avatarId}-${r.errorCode}-${i}`}>
                    <td className="tool-workshop-table-icon">
                      {r.errorCode && isPermissionErrorCode(r.errorCode) ? (
                        <span
                          className="tool-workshop-denied-icon"
                          title="Permission / policy"
                          aria-label="Permission denied"
                        >
                          ⛔
                        </span>
                      ) : (
                        <span aria-hidden>·</span>
                      )}
                    </td>
                    <td>
                      {r.lastEventAt ? (
                        <time dateTime={new Date(r.lastEventAt).toISOString()}>
                          {formatEventDateTime(r.lastEventAt)}
                        </time>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{r.toolId}</td>
                    <td>{r.avatarId}</td>
                    <td>{r.errorCode ?? "—"}</td>
                    <td>{r.successCount}</td>
                    <td>{r.failureCount}</td>
                    <td
                      className="tool-workshop-table-preview"
                      title={r.lastResultPreview ?? undefined}
                    >
                      {r.lastResultPreview
                        ? `${r.lastResultPreview.slice(0, 72)}${r.lastResultPreview.length > 72 ? "…" : ""}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "events" && (
        <section className="tool-workshop-section">
          <h3>Recent events</h3>
          {eventsDisplay.length === 0 ? (
            <p className="tool-workshop-empty">No events yet.</p>
          ) : (
            <table className="tool-workshop-table">
              <thead>
                <tr>
                  <th aria-hidden />
                  <th>Date / time</th>
                  <th>Tool</th>
                  <th>Avatar</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Preview</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {eventsDisplay.slice(0, 200).map((e) => (
                  <tr
                    key={e.id}
                    className={
                      e.isPermissionError ? "tool-workshop-event--denied" : undefined
                    }
                  >
                    <td className="tool-workshop-table-icon">
                      {e.isPermissionError ? "⛔" : e.ok ? "✓" : "✗"}
                    </td>
                    <td>
                      <time dateTime={new Date(e.at).toISOString()}>
                        {formatEventDateTime(e.at)}
                      </time>
                    </td>
                    <td>{e.toolId}</td>
                    <td>{e.avatarId}</td>
                    <td>{e.source}</td>
                    <td>{e.ok ? "ok" : e.errorCode ?? "fail"}</td>
                    <td
                      className="tool-workshop-table-preview"
                      title={e.resultPreview ?? e.argsPreview ?? undefined}
                    >
                      {e.resultPreview
                        ? `${e.resultPreview.slice(0, 160)}${e.resultPreview.length > 160 ? "…" : ""}`
                        : e.argsPreview
                          ? `${e.argsPreview.slice(0, 160)}${e.argsPreview.length > 160 ? "…" : ""}`
                          : "—"}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="tool-workshop-event-escalate"
                        title="Create an Unmet Need from this event"
                        onClick={() => openEscalateForm(e)}
                      >
                        Add to Unmet Needs
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "refiner" && (
        <section className="tool-workshop-section">
          <h3>Refiner configuration</h3>
          <p className="tool-workshop-hint">
            Defaults: max {DEFAULT_TOOL_WORKSHOP_SETTINGS.maxActiveAddenda} addenda,{" "}
            {DEFAULT_TOOL_WORKSHOP_SETTINGS.maxAddendumItemChars} chars/item. Auto
            refiner is off until you enable it.
          </p>
          <div className="tool-workshop-form-grid">
            <label>
              Max active addenda
              <input
                type="number"
                min={1}
                max={32}
                value={settings.maxActiveAddenda}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isNaN(n)) {
                    updateToolWorkshopSettings({ maxActiveAddenda: n });
                    refresh();
                  }
                }}
              />
            </label>
            <label>
              Max chars per item
              <input
                type="number"
                min={80}
                max={2000}
                value={settings.maxAddendumItemChars}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isNaN(n)) {
                    updateToolWorkshopSettings({ maxAddendumItemChars: n });
                    refresh();
                  }
                }}
              />
            </label>
            <label>
              Auto refiner interval (hours, 0=off)
              <input
                type="number"
                min={0}
                max={168}
                value={settings.refinerIntervalHours}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isNaN(n)) {
                    updateToolWorkshopSettings({ refinerIntervalHours: n });
                    refresh();
                  }
                }}
              />
            </label>
            <label>
              Failure delta threshold (0=off)
              <input
                type="number"
                min={0}
                max={999}
                value={settings.refinerFailureDeltaThreshold}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!Number.isNaN(n)) {
                    updateToolWorkshopSettings({
                      refinerFailureDeltaThreshold: n,
                    });
                    refresh();
                  }
                }}
              />
            </label>
            <label className="tool-workshop-check">
              <input
                type="checkbox"
                checked={settings.refinerAutoEnabled}
                onChange={(e) => {
                  updateToolWorkshopSettings({
                    refinerAutoEnabled: e.target.checked,
                  });
                  refresh();
                }}
              />
              Enable automatic refiner (requires Ollama; uses timer / threshold)
            </label>
          </div>
          <label className="tool-workshop-label-block">
            Optional: override refiner system prompt (leave blank for default)
            <textarea
              className="tool-workshop-textarea"
              rows={6}
              placeholder={REFINER_SYSTEM_DEFAULT.slice(0, 200) + "…"}
              value={workshop.refinerSystemOverride ?? ""}
              onChange={(e) => {
                const doc = loadToolWorkshopDoc();
                const v = e.target.value.trim();
                doc.refinerSystemOverride = v || undefined;
                saveToolWorkshopDoc(doc);
                refresh();
              }}
            />
          </label>
          <div className="tool-workshop-actions">
            <span className="tool-workshop-ollama">
              Ollama: {ollamaPresence}
            </span>
            <button type="button" onClick={onRefreshOllama}>
              Refresh Ollama
            </button>
            <button
              type="button"
              className="tool-workshop-primary"
              disabled={refinerBusy || ollamaPresence !== "ready"}
              onClick={onRunRefiner}
            >
              {refinerBusy ? "Running…" : "Run refiner now"}
            </button>
          </div>
        </section>
      )}

      {tab === "proposals" && (
        <section className="tool-workshop-section">
          <h3>Pending proposals</h3>
          {workshop.pendingProposals.length === 0 ? (
            <p className="tool-workshop-empty">No pending proposals.</p>
          ) : (
            <ul className="tool-workshop-proposals">
              {workshop.pendingProposals.map((p) => (
                <li key={p.id} className="tool-workshop-proposal-card">
                  <p className="tool-workshop-proposal-summary">{p.summary}</p>
                  <ul>
                    {p.items.map((it, idx) => (
                      <li key={idx}>
                        <strong>[{it.category}]</strong> {it.bodyMarkdown}
                      </li>
                    ))}
                  </ul>
                  <div className="tool-workshop-actions">
                    <button
                      type="button"
                      className="tool-workshop-primary"
                      onClick={() => onApprove(p)}
                    >
                      Approve
                    </button>
                    <button type="button" onClick={() => onReject(p.id)}>
                      Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "active" && (
        <section className="tool-workshop-section">
          <h3>Active guidance in prompts</h3>
          {workshop.activeAddenda.filter((a) => a.active).length === 0 ? (
            <p className="tool-workshop-empty">No active addenda.</p>
          ) : (
            <ul className="tool-workshop-addenda">
              {workshop.activeAddenda.map((a) => (
                <li key={a.id} className="tool-workshop-addendum">
                  <label className="tool-workshop-check">
                    <input
                      type="checkbox"
                      checked={a.active}
                      onChange={(e) => {
                        setAddendumActive(a.id, e.target.checked);
                        refresh();
                      }}
                    />
                    <span>
                      <strong>[{a.category}]</strong> {a.body}
                    </span>
                  </label>
                  <button
                    type="button"
                    className="tool-workshop-remove"
                    onClick={() => {
                      removeAddendum(a.id);
                      refresh();
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {escalateForm && (
        <div
          className="tool-workshop-modal-backdrop"
          role="presentation"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget) setEscalateForm(null);
          }}
        >
          <div
            className="tool-workshop-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tool-workshop-escalate-heading"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="tool-workshop-escalate-heading">Add to Unmet Needs</h3>
            <p className="tool-workshop-hint">
              Prefilled from telemetry when possible. Related project links world
              metadata (Workshops → Projects).
            </p>
            {(() => {
              const uid = escalateForm.event.userMessageId;
              const raw =
                uid != null ? resolveUserMessagePreview?.(uid) : undefined;
              if (!raw?.trim()) return null;
              const line = raw.replace(/\s+/g, " ").trim();
              const short =
                line.length > 360 ? `${line.slice(0, 357).trimEnd()}…` : line;
              return (
                <p className="tool-workshop-escalate-excerpt">
                  <strong>User message:</strong> {short}
                </p>
              );
            })()}
            <label className="tool-workshop-label-block">
              Title
              <input
                type="text"
                className="tool-workshop-textarea tool-workshop-escalate-title-input"
                value={escalateForm.title}
                onChange={(e) =>
                  setEscalateForm((f) =>
                    f ? { ...f, title: e.target.value } : f
                  )
                }
                autoFocus
                aria-label="Unmet need title"
              />
            </label>
            <label className="tool-workshop-label-block">
              Related project (optional)
              <select
                value={escalateForm.relatedProjectId}
                onChange={(e) =>
                  setEscalateForm((f) =>
                    f ? { ...f, relatedProjectId: e.target.value } : f
                  )
                }
                aria-label="Related world metadata project"
              >
                <option value="">— None —</option>
                {projectsList.map(([id, proj]) => (
                  <option key={id} value={id}>
                    {proj.title}
                  </option>
                ))}
              </select>
            </label>
            <div className="tool-workshop-actions">
              <button
                type="button"
                className="tool-workshop-primary"
                onClick={submitEscalateForm}
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setEscalateForm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
