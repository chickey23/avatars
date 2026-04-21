/**
 * Right-column Storage / cache visualizer — local caches, scoring diagnostics, audit tail.
 * Uses a structured hover + click panel (not native title tooltips).
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { EmailFocusArtifacts, EmailRankingDiagnostics } from "../types";
import { EMAIL_STRONG_MATCH_MIN_NORM } from "../services/contextScoring/email";
import type { ParsedRankedEmailLine } from "../services/sourceCacheViz";

export type EmailInsightSample = {
  messageId: string;
  summary: string;
  relevance: "relevant" | "irrelevant" | "uncertain";
};

export type WorldviewAuditTailRow = {
  id: string;
  ts: number;
  avatarId: string;
  revertedAt?: number;
  tools: string;
};

export type SourceCacheVizProps = {
  diagnostics?: EmailRankingDiagnostics;
  /** When diagnostics absent, parsed `relevantData` inbox lines (Phase A). */
  parsedFallbackLines?: ParsedRankedEmailLine[];
  emailInsights: {
    total: number;
    byRelevance: Record<"relevant" | "irrelevant" | "uncertain", number>;
    recentSamples: EmailInsightSample[];
  };
  worldMeta: {
    peopleCount: number;
    projectsCount: number;
    userProfileUpdatedAt?: number;
  };
  worldviewAuditTail: WorldviewAuditTailRow[];
  wavesQueueLength: number;
  wavesStorageKey: string;
  lastUserEmailFocus?: EmailFocusArtifacts;
  futureSources: ReadonlyArray<{ id: string; label: string }>;
  onOpenWorldviewTab: () => void;
};

type PanelSection =
  | "gmail"
  | "inbox"
  | "world"
  | "worldview"
  | "waves"
  | "future";

function formatTs(ts: number): string {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return String(ts);
  }
}

export function SourceCacheViz({
  diagnostics,
  parsedFallbackLines = [],
  emailInsights,
  worldMeta,
  worldviewAuditTail,
  wavesQueueLength,
  wavesStorageKey,
  lastUserEmailFocus,
  futureSources,
  onOpenWorldviewTab,
}: SourceCacheVizProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<PanelSection | null>(null);
  const [pinned, setPinned] = useState(false);

  const close = useCallback(() => {
    setOpen(null);
    setPinned(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open || !pinned) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current && !rootRef.current.contains(t)) close();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, pinned, close]);

  const openSection = (s: PanelSection) => {
    setOpen(s);
  };

  const togglePin = (s: PanelSection) => {
    if (open === s && pinned) {
      close();
      return;
    }
    setOpen(s);
    setPinned(true);
  };

  const useDiagInbox = (diagnostics?.inPrompt?.length ?? 0) > 0;
  const inboxRows = useDiagInbox
      ? diagnostics!.inPrompt.map((r) => ({
          kind: "diag" as const,
          rank: r.rank,
          score: r.normFocus,
          label: r.subject.slice(0, 48) + (r.subject.length > 48 ? "…" : ""),
          detail: `${r.from} · id ${r.emailId.slice(0, 10)}…`,
          weak: r.normFocus < EMAIL_STRONG_MATCH_MIN_NORM,
        }))
      : parsedFallbackLines.map((p) => ({
          kind: "parse" as const,
          rank: p.rank,
          score: p.score,
          label: p.rest.slice(0, 80) + (p.rest.length > 80 ? "…" : ""),
          detail: `id ${p.emailId.slice(0, 12)}…`,
          weak: p.score < EMAIL_STRONG_MATCH_MIN_NORM,
        }));

  const belowTopK = diagnostics?.belowTopK ?? [];

  return (
    <div
      ref={rootRef}
      className="source-cache-viz"
      role="navigation"
      aria-label="Storage and cache diagnostics"
    >
      <div className="source-cache-viz-heading" aria-hidden>
        Store
      </div>
      <ul className="source-cache-viz-tracks" role="list">
        <li className="source-cache-viz-track-item">
          <button
            type="button"
            className={`source-cache-viz-chip source-cache-viz-chip--gmail${
              open === "gmail" ? " is-open" : ""
            }`}
            aria-expanded={open === "gmail"}
            aria-controls={panelId}
            onMouseEnter={() => !pinned && openSection("gmail")}
            onFocus={() => !pinned && openSection("gmail")}
            onMouseLeave={() => !pinned && open === "gmail" && setOpen(null)}
            onClick={() => togglePin("gmail")}
          >
            <span className="source-cache-viz-chip-dot" aria-hidden />
            Gmail
          </button>
        </li>
        <li className="source-cache-viz-track-item">
          <button
            type="button"
            className={`source-cache-viz-chip source-cache-viz-chip--inbox${
              open === "inbox" ? " is-open" : ""
            }`}
            aria-expanded={open === "inbox"}
            aria-controls={panelId}
            onMouseEnter={() => !pinned && openSection("inbox")}
            onFocus={() => !pinned && openSection("inbox")}
            onMouseLeave={() => !pinned && open === "inbox" && setOpen(null)}
            onClick={() => togglePin("inbox")}
          >
            <span className="source-cache-viz-chip-dot" aria-hidden />
            Inbox
          </button>
        </li>
        <li className="source-cache-viz-track-item">
          <button
            type="button"
            className={`source-cache-viz-chip source-cache-viz-chip--world${
              open === "world" ? " is-open" : ""
            }`}
            aria-expanded={open === "world"}
            aria-controls={panelId}
            onMouseEnter={() => !pinned && openSection("world")}
            onFocus={() => !pinned && openSection("world")}
            onMouseLeave={() => !pinned && open === "world" && setOpen(null)}
            onClick={() => togglePin("world")}
          >
            <span className="source-cache-viz-chip-dot" aria-hidden />
            World
          </button>
        </li>
        <li className="source-cache-viz-track-item">
          <button
            type="button"
            className={`source-cache-viz-chip source-cache-viz-chip--worldview${
              open === "worldview" ? " is-open" : ""
            }`}
            aria-expanded={open === "worldview"}
            aria-controls={panelId}
            onMouseEnter={() => !pinned && openSection("worldview")}
            onFocus={() => !pinned && openSection("worldview")}
            onMouseLeave={() =>
              !pinned && open === "worldview" && setOpen(null)
            }
            onClick={() => togglePin("worldview")}
          >
            <span className="source-cache-viz-chip-dot" aria-hidden />
            WV
          </button>
        </li>
        <li className="source-cache-viz-track-item">
          <button
            type="button"
            className={`source-cache-viz-chip source-cache-viz-chip--waves${
              open === "waves" ? " is-open" : ""
            }`}
            aria-expanded={open === "waves"}
            aria-controls={panelId}
            onMouseEnter={() => !pinned && openSection("waves")}
            onFocus={() => !pinned && openSection("waves")}
            onMouseLeave={() => !pinned && open === "waves" && setOpen(null)}
            onClick={() => togglePin("waves")}
          >
            <span className="source-cache-viz-chip-dot" aria-hidden />
            Waves
          </button>
        </li>
        <li className="source-cache-viz-track-item">
          <button
            type="button"
            className={`source-cache-viz-chip source-cache-viz-chip--future${
              open === "future" ? " is-open" : ""
            }`}
            aria-expanded={open === "future"}
            aria-controls={panelId}
            onMouseEnter={() => !pinned && openSection("future")}
            onFocus={() => !pinned && openSection("future")}
            onMouseLeave={() => !pinned && open === "future" && setOpen(null)}
            onClick={() => togglePin("future")}
          >
            <span className="source-cache-viz-chip-dot" aria-hidden />
            Soon
          </button>
        </li>
      </ul>

      {open && (
        <div
          id={panelId}
          className="source-cache-viz-panel"
          role="region"
          aria-label={`${open} details`}
        >
          <button
            type="button"
            className="source-cache-viz-panel-close"
            onClick={close}
            aria-label="Close panel"
          >
            ×
          </button>

          {open === "gmail" && (
            <div className="source-cache-viz-sections">
              <section className="source-cache-viz-section">
                <h4 className="source-cache-viz-section-title">Email insight cache</h4>
                <ul className="source-cache-viz-bullets">
                  <li>Rows in local store: {emailInsights.total}</li>
                  <li>
                    By model relevance: relevant {emailInsights.byRelevance.relevant},
                    uncertain {emailInsights.byRelevance.uncertain},{" "}
                    <span className="source-cache-viz-warn-strong">
                      irrelevant {emailInsights.byRelevance.irrelevant}
                    </span>
                  </li>
                </ul>
              </section>
              {emailInsights.recentSamples.length > 0 && (
                <section className="source-cache-viz-section">
                  <h4 className="source-cache-viz-section-title">Recent samples</h4>
                  <ul className="source-cache-viz-bullets source-cache-viz-bullets--dense">
                    {emailInsights.recentSamples.map((s) => (
                      <li
                        key={s.messageId}
                        className={`source-cache-viz-insight-li source-cache-viz-insight-li--${s.relevance}`}
                      >
                        <span className="source-cache-viz-insight-rel">
                          {s.relevance}
                        </span>
                        {s.summary.slice(0, 140)}
                        {s.summary.length > 140 ? "…" : ""}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {lastUserEmailFocus && (
                <section className="source-cache-viz-section">
                  <h4 className="source-cache-viz-section-title">
                    Last user turn — focus prep
                  </h4>
                  <ul className="source-cache-viz-bullets">
                    <li>Message id: {lastUserEmailFocus.messageId.slice(0, 16)}…</li>
                    <li>Cache: {lastUserEmailFocus.cacheHit ? "hit" : "miss"}</li>
                    <li
                      className={`source-cache-viz-focus-rel source-cache-viz-focus-rel--${lastUserEmailFocus.relevance}`}
                    >
                      Prep relevance: {lastUserEmailFocus.relevance}
                    </li>
                  </ul>
                </section>
              )}
            </div>
          )}

          {open === "inbox" && (
            <div className="source-cache-viz-sections">
              <section className="source-cache-viz-section">
                <h4 className="source-cache-viz-section-title">
                  In prompt (top {diagnostics?.topK ?? "K"})
                </h4>
                <p className="source-cache-viz-hint">
                  Scores are focus-relative norm (same as prompt lines). Under{" "}
                  {EMAIL_STRONG_MATCH_MIN_NORM}: weak for body prefetch.
                </p>
                {inboxRows.length === 0 ? (
                  <p className="source-cache-viz-empty">No ranked inbox lines yet.</p>
                ) : (
                  <ul className="source-cache-viz-bullets source-cache-viz-bullets--dense">
                    {inboxRows.map((r, i) => (
                      <li
                        key={i}
                        className={
                          r.weak
                            ? "source-cache-viz-inbox-li source-cache-viz-inbox-li--weak"
                            : "source-cache-viz-inbox-li"
                        }
                      >
                        <span className="source-cache-viz-inbox-rank">#{r.rank}</span>
                        <span className="source-cache-viz-inbox-score">{r.score}</span>
                        {r.label}
                        <span className="source-cache-viz-inbox-detail">{r.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
              {belowTopK.length > 0 && (
                <section className="source-cache-viz-section">
                  <h4 className="source-cache-viz-section-title">
                    Scored, not in prompt
                  </h4>
                  <p className="source-cache-viz-hint">
                    Fetched and ranked with the batch; omitted from top-K relevantData
                    lines.
                  </p>
                  <ul className="source-cache-viz-bullets source-cache-viz-bullets--dense">
                    {belowTopK.map((r) => (
                      <li
                        key={r.emailId}
                        className={
                          r.normFocus < EMAIL_STRONG_MATCH_MIN_NORM
                            ? "source-cache-viz-inbox-li source-cache-viz-inbox-li--weak"
                            : "source-cache-viz-inbox-li"
                        }
                      >
                        <span className="source-cache-viz-inbox-rank">#{r.rank}</span>
                        <span className="source-cache-viz-inbox-score">{r.normFocus}</span>
                        {r.subject.slice(0, 56)}
                        {r.subject.length > 56 ? "…" : ""}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {open === "world" && (
            <div className="source-cache-viz-sections">
              <section className="source-cache-viz-section">
                <h4 className="source-cache-viz-section-title">World metadata (local)</h4>
                <ul className="source-cache-viz-bullets">
                  <li>People records: {worldMeta.peopleCount}</li>
                  <li>Projects: {worldMeta.projectsCount}</li>
                  {worldMeta.userProfileUpdatedAt != null && (
                    <li>User profile updated: {formatTs(worldMeta.userProfileUpdatedAt)}</li>
                  )}
                </ul>
              </section>
            </div>
          )}

          {open === "worldview" && (
            <div className="source-cache-viz-sections">
              <section className="source-cache-viz-section">
                <h4 className="source-cache-viz-section-title">Worldview audit (tail)</h4>
                <button
                  type="button"
                  className="source-cache-viz-linkish"
                  onClick={onOpenWorldviewTab}
                >
                  Open full Worldview tab →
                </button>
                {worldviewAuditTail.length === 0 ? (
                  <p className="source-cache-viz-empty">No audit rows.</p>
                ) : (
                  <ul className="source-cache-viz-bullets source-cache-viz-bullets--dense">
                    {worldviewAuditTail.map((r) => (
                      <li key={r.id}>
                        {formatTs(r.ts)} · {r.avatarId}
                        {r.revertedAt ? (
                          <span className="source-cache-viz-muted"> · reverted</span>
                        ) : null}
                        <div className="source-cache-viz-audit-tools">{r.tools}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}

          {open === "waves" && (
            <div className="source-cache-viz-sections">
              <section className="source-cache-viz-section">
                <h4 className="source-cache-viz-section-title">Chat Visualizer queue</h4>
                <ul className="source-cache-viz-bullets">
                  <li>Entries: {wavesQueueLength}</li>
                  <li>
                    Persist key: <code className="source-cache-viz-code">{wavesStorageKey}</code>
                  </li>
                </ul>
              </section>
            </div>
          )}

          {open === "future" && (
            <div className="source-cache-viz-sections">
              <section className="source-cache-viz-section">
                <h4 className="source-cache-viz-section-title">Planned sources</h4>
                <p className="source-cache-viz-hint">
                  Connectors not wired yet; each will mirror Gmail: fetch → score →
                  optional insight cache → viz strip.
                </p>
                <ul className="source-cache-viz-bullets">
                  {futureSources.map((s) => (
                    <li key={s.id}>
                      {s.label}: <span className="source-cache-viz-muted">not connected</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
