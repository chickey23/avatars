/**
 * Right-column Storage / cache visualizer — local caches, scoring diagnostics, audit tail.
 * Uses a structured hover + click panel (not native title tooltips).
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Avatar, EmailFocusArtifacts, EmailRankingDiagnostics } from "../types";
import { EMAIL_STRONG_MATCH_MIN_NORM } from "../services/contextScoring/email";
import type { ParsedRankedEmailLine } from "../services/sourceCacheViz";
import {
  PLATFORM_LOG_CATEGORY,
  subscribePlatformEvents,
  type PlatformBusEvent,
  type SourceCacheKind,
} from "../services/platform";
import {
  getSessionLogSnapshot,
  subscribeSessionLog,
  type SessionLogEntry,
} from "../services/sessionLog";
import {
  SOURCE_RUNNER_KINDS,
  sourceRunnerMonitorName,
  DUE_AND_SNOOZED_ITEMS_MONITOR_NAME,
} from "../services/monitors";
import { findAvatarsWithTag, monitorTag } from "../services/avatarTags";
import { parseContractLogCategory } from "../services/sessionLog/contractLog";

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
  /**
   * Full avatar catalog (defaults + user edits). Used by the Background panel
   * to resolve which avatar holds each `monitor:*` contract via `systemTags`,
   * so steward rows can show portrait + name for the current claimant.
   */
  fullAvatarCatalog: Avatar[];
};

type PanelSection =
  | "gmail"
  | "inbox"
  | "world"
  | "worldview"
  | "waves"
  | "background"
  | "future";

/** Background panel rows: one per contract that has a steward avatar. */
type ContractRow = {
  /** Monitor name, e.g. `source_runner:email`. */
  contractName: string;
  /** Display label for the row. */
  label: string;
  /** Steward avatar(s) currently tagged with this monitor. */
  claimants: Avatar[];
  /** Optional source-runner kind for heartbeat lookups. */
  runnerKind?: SourceCacheKind;
};

const NEUTRAL_BACKGROUND_ACCENT = "#94a3b8";

type PlatformRunnerSnapshot = Record<
  SourceCacheKind,
  { fetchedAt: number; durationMs: number; itemCount: number } | null
>;

const BACKGROUND_LOG_TAIL = 20;

function useContractsState(): {
  runners: PlatformRunnerSnapshot;
  logTail: SessionLogEntry[];
} {
  const [runners, setRunners] = useState<PlatformRunnerSnapshot>({
    email: null,
    calendar: null,
    contacts: null,
  });
  const [logTail, setLogTail] = useState<SessionLogEntry[]>([]);

  useEffect(() => {
    const sync = () => {
      const all = getSessionLogSnapshot();
      const tail: SessionLogEntry[] = [];
      for (let i = all.length - 1; i >= 0 && tail.length < BACKGROUND_LOG_TAIL; i--) {
        const e = all[i]!;
        if (
          e.category.startsWith("contract:") ||
          e.category.startsWith(`${PLATFORM_LOG_CATEGORY}_`)
        ) {
          tail.push(e);
        }
      }
      tail.reverse();
      setLogTail(tail);
    };
    sync();
    return subscribeSessionLog(sync);
  }, []);

  useEffect(() => {
    return subscribePlatformEvents((evt: PlatformBusEvent) => {
      if (evt.type === "runner_heartbeat") {
        setRunners((prev) => ({
          ...prev,
          [evt.kind]: {
            fetchedAt: evt.fetchedAt,
            durationMs: evt.durationMs,
            itemCount: evt.itemCount,
          },
        }));
      }
    });
  }, []);

  return { runners, logTail };
}

/**
 * Resolve each background contract to its claimant avatar(s) by looking up
 * `monitor:<name>` in the catalog's `systemTags`. Re-tagging an avatar in
 * the editor will cause this to relabel without a reload.
 */
function buildContractRows(catalog: Avatar[]): ContractRow[] {
  const rows: ContractRow[] = [];
  for (const kind of SOURCE_RUNNER_KINDS) {
    const name = sourceRunnerMonitorName(kind);
    rows.push({
      contractName: name,
      label: kind,
      runnerKind: kind,
      claimants: findAvatarsWithTag(catalog, monitorTag(name)),
    });
  }
  rows.push({
    contractName: DUE_AND_SNOOZED_ITEMS_MONITOR_NAME,
    label: "scheduler",
    claimants: findAvatarsWithTag(
      catalog,
      monitorTag(DUE_AND_SNOOZED_ITEMS_MONITOR_NAME)
    ),
  });
  return rows;
}

function ageLabel(fetchedAt: number, now: number): string {
  const ageSec = Math.max(0, Math.round((now - fetchedAt) / 1000));
  if (ageSec < 60) return `${ageSec}s ago`;
  const mins = Math.floor(ageSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

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
  fullAvatarCatalog,
}: SourceCacheVizProps) {
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<PanelSection | null>(null);
  const [pinned, setPinned] = useState(false);
  const { runners: backgroundRunners, logTail: backgroundLogTail } =
    useContractsState();
  const backgroundNow = useMemo(
    () => Date.now(),
    [backgroundLogTail, backgroundRunners]
  );

  const contractRows = useMemo(
    () => buildContractRows(fullAvatarCatalog),
    [fullAvatarCatalog]
  );

  /**
   * Chip accent: prefer the most-recently-active steward's color (heuristic:
   * the first claimant of any contract that has reported a heartbeat). Falls
   * back to a neutral slate when nothing is bound yet.
   */
  const backgroundChipAccent = useMemo(() => {
    for (const row of contractRows) {
      const heartbeat = row.runnerKind ? backgroundRunners[row.runnerKind] : null;
      const first = row.claimants[0];
      if (heartbeat && first?.appearance?.accentColor) {
        return first.appearance.accentColor;
      }
    }
    const firstClaimed = contractRows.find((r) => r.claimants.length > 0);
    return (
      firstClaimed?.claimants[0]?.appearance?.accentColor ?? NEUTRAL_BACKGROUND_ACCENT
    );
  }, [contractRows, backgroundRunners]);

  /** Build a per-contract claimant lookup so log rows can be tinted by owner. */
  const logRowAccent = useCallback(
    (category: string): string | null => {
      const parsed = parseContractLogCategory(category);
      if (!parsed) return null;
      const row = contractRows.find((r) => r.contractName === parsed.contract);
      return row?.claimants[0]?.appearance?.accentColor ?? null;
    },
    [contractRows]
  );

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
            className={`source-cache-viz-chip source-cache-viz-chip--background source-cache-viz-chip--platform${
              open === "background" ? " is-open" : ""
            }`}
            aria-expanded={open === "background"}
            aria-controls={panelId}
            onMouseEnter={() => !pinned && openSection("background")}
            onFocus={() => !pinned && openSection("background")}
            onMouseLeave={() => !pinned && open === "background" && setOpen(null)}
            onClick={() => togglePin("background")}
            style={{
              "--background-accent": backgroundChipAccent,
              "--platform-accent": backgroundChipAccent,
            } as React.CSSProperties}
          >
            <span
              className="source-cache-viz-chip-dot source-cache-viz-chip-dot--background source-cache-viz-chip-dot--platform"
              aria-hidden
            />
            Background
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

          {open === "background" && (
            <div className="source-cache-viz-sections">
              <section className="source-cache-viz-section">
                <h4 className="source-cache-viz-section-title">
                  Background runners
                </h4>
                <p className="source-cache-viz-hint">
                  Each runner has a steward avatar via its{" "}
                  <code className="source-cache-viz-code">monitor:*</code> tag.
                  Re-tag any avatar in the editor to transfer ownership.
                </p>
                <ul className="source-cache-viz-bullets source-cache-viz-background-rows">
                  {contractRows
                    .filter((r) => r.runnerKind)
                    .map((row) => {
                      const r = row.runnerKind ? backgroundRunners[row.runnerKind] : null;
                      const claimant = row.claimants[0];
                      const accent =
                        claimant?.appearance?.accentColor ?? NEUTRAL_BACKGROUND_ACCENT;
                      return (
                        <li
                          key={row.contractName}
                          className="source-cache-viz-background-row source-cache-viz-platform-runner"
                          style={{
                            "--steward-accent": accent,
                          } as React.CSSProperties}
                        >
                          <span
                            className="source-cache-viz-steward-dot"
                            aria-hidden
                            style={{ background: accent }}
                          />
                          <span className="source-cache-viz-steward-name">
                            {claimant?.givenName ?? (
                              <span className="source-cache-viz-warn-strong">
                                unclaimed
                              </span>
                            )}
                          </span>
                          <span className="source-cache-viz-platform-kind source-cache-viz-muted">
                            {row.label}
                          </span>
                          {r ? (
                            <>
                              <span className="source-cache-viz-platform-meta">
                                n={r.itemCount}
                              </span>
                              <span className="source-cache-viz-platform-meta">
                                {r.durationMs}ms
                              </span>
                              <span className="source-cache-viz-platform-meta source-cache-viz-muted">
                                {ageLabel(r.fetchedAt, backgroundNow)}
                              </span>
                            </>
                          ) : (
                            <span className="source-cache-viz-muted">
                              no heartbeat yet
                            </span>
                          )}
                        </li>
                      );
                    })}
                </ul>
              </section>

              <section className="source-cache-viz-section">
                <h4 className="source-cache-viz-section-title">Timekeeper</h4>
                {(() => {
                  const sched = contractRows.find(
                    (r) => r.contractName === DUE_AND_SNOOZED_ITEMS_MONITOR_NAME
                  );
                  const claimant = sched?.claimants[0];
                  const accent =
                    claimant?.appearance?.accentColor ?? NEUTRAL_BACKGROUND_ACCENT;
                  return (
                    <ul className="source-cache-viz-bullets source-cache-viz-background-rows">
                      <li
                        className="source-cache-viz-background-row source-cache-viz-platform-runner"
                        style={{ "--steward-accent": accent } as React.CSSProperties}
                      >
                        <span
                          className="source-cache-viz-steward-dot"
                          aria-hidden
                          style={{ background: accent }}
                        />
                        <span className="source-cache-viz-steward-name">
                          {claimant?.givenName ?? (
                            <span className="source-cache-viz-warn-strong">
                              unclaimed
                            </span>
                          )}
                        </span>
                        <span className="source-cache-viz-platform-kind source-cache-viz-muted">
                          due &amp; snoozed items
                        </span>
                      </li>
                    </ul>
                  );
                })()}
              </section>

              <section className="source-cache-viz-section">
                <h4 className="source-cache-viz-section-title">
                  Recent background activity
                </h4>
                {backgroundLogTail.length === 0 ? (
                  <p className="source-cache-viz-empty">No background events yet.</p>
                ) : (
                  <ul className="source-cache-viz-bullets source-cache-viz-bullets--dense source-cache-viz-platform-log source-cache-viz-background-log">
                    {backgroundLogTail.map((e, i) => {
                      const accent = logRowAccent(e.category);
                      const parsed = parseContractLogCategory(e.category);
                      const display = parsed
                        ? `${parsed.contract} · ${parsed.event}`
                        : e.category.startsWith(`${PLATFORM_LOG_CATEGORY}_`)
                          ? e.category.slice(PLATFORM_LOG_CATEGORY.length + 1)
                          : e.category;
                      return (
                        <li
                          key={`${e.ts}-${i}`}
                          className={`source-cache-viz-platform-log-row source-cache-viz-background-log-row source-cache-viz-platform-log-row--${e.level}`}
                          style={
                            accent
                              ? ({ "--steward-accent": accent } as React.CSSProperties)
                              : undefined
                          }
                        >
                          {accent && (
                            <span
                              className="source-cache-viz-steward-dot source-cache-viz-steward-dot--small"
                              aria-hidden
                              style={{ background: accent }}
                            />
                          )}
                          <span className="source-cache-viz-platform-log-cat">
                            {display}
                          </span>
                          <span className="source-cache-viz-platform-log-msg">
                            {e.message}
                          </span>
                          {e.detail && (
                            <span className="source-cache-viz-platform-log-detail source-cache-viz-muted">
                              {e.detail}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
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
