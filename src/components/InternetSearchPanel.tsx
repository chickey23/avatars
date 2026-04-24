import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  formatInternetContextLine,
  mergePinnedInternetLines,
} from "../services/internetContextLines";
import {
  runTargetedSearch,
  TAURI_ONLY_NOTICE,
  type TargetedSearchHit,
} from "../services/targetedSearch";

export type InternetSearchSecondaryApplyContext = {
  pickedHits: TargetedSearchHit[];
  /** Current search box text (fallback topic when no workshop prefill). */
  internetQuery: string;
  /** Notices from the discovery Run that produced the hit list. */
  discoveryNotices: string[];
};

export type InternetSearchPanelProps = {
  /** Max hits per Run (from context entry budgets). */
  internetSearchMaxResults: number;
  /** Current pinned lines on situation context (for merge). */
  userInternetContextLines: string[] | undefined;
  onPatchPinned: (nextLines: string[]) => void;
  /** Optional second action when user has picked hits (e.g. open avatar builder). */
  secondaryAction?: {
    label: string;
    onApply: (
      ctx: InternetSearchSecondaryApplyContext
    ) => void | Promise<void>;
  };
  /** Intro copy above the search row. */
  intro: ReactNode;
  /** When set, pre-fills the search box (e.g. from `avatars.workshop.open_draft`). */
  externalQueryPrefill?: string | null;
};

export function InternetSearchPanel({
  internetSearchMaxResults,
  userInternetContextLines,
  onPatchPinned,
  secondaryAction,
  intro,
  externalQueryPrefill,
}: InternetSearchPanelProps) {
  const [internetQuery, setInternetQuery] = useState("");
  const [internetLoading, setInternetLoading] = useState(false);
  const [internetResp, setInternetResp] = useState<Awaited<
    ReturnType<typeof runTargetedSearch>
  > | null>(null);
  const [internetPickUrls, setInternetPickUrls] = useState<Set<string>>(
    () => new Set()
  );
  const [secondaryLoading, setSecondaryLoading] = useState(false);

  useEffect(() => {
    const q = externalQueryPrefill?.trim();
    if (q) setInternetQuery(q);
  }, [externalQueryPrefill]);

  const runInternetSearch = useCallback(async () => {
    setInternetLoading(true);
    setInternetPickUrls(new Set());
    try {
      const r = await runTargetedSearch(
        internetQuery,
        internetSearchMaxResults
      );
      setInternetResp(r);
    } catch (e) {
      setInternetResp({
        hits: [],
        providersTried: [],
        notices: [`targeted_search_invoke_error:${String(e)}`],
      });
    } finally {
      setInternetLoading(false);
    }
  }, [internetQuery, internetSearchMaxResults]);

  const toggleInternetPick = useCallback((url: string) => {
    setInternetPickUrls((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }, []);

  const addInternetSelectionToContext = useCallback(() => {
    if (!internetResp?.hits.length) return;
    const picked = internetResp.hits.filter((h) =>
      internetPickUrls.has(h.url.trim())
    );
    if (picked.length === 0) return;
    const lines = picked.map(formatInternetContextLine);
    const merged = mergePinnedInternetLines(userInternetContextLines, lines);
    onPatchPinned(merged);
  }, [internetPickUrls, internetResp, onPatchPinned, userInternetContextLines]);

  const applySecondary = useCallback(async () => {
    if (!secondaryAction || !internetResp?.hits.length) return;
    const picked = internetResp.hits.filter((h) =>
      internetPickUrls.has(h.url.trim())
    );
    if (picked.length === 0) return;
    setSecondaryLoading(true);
    try {
      await secondaryAction.onApply({
        pickedHits: picked,
        internetQuery,
        discoveryNotices: internetResp.notices ?? [],
      });
    } finally {
      setSecondaryLoading(false);
    }
  }, [
    internetPickUrls,
    internetResp,
    internetQuery,
    secondaryAction,
  ]);

  return (
    <div className="context-email">
      <p className="context-projects-hint">{intro}</p>
      <div className="context-internet-search-row">
        <input
          type="search"
          className="context-projects-title-input"
          placeholder="Search query…"
          value={internetQuery}
          onChange={(e) => setInternetQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void runInternetSearch();
          }}
          aria-label="Internet search query"
        />
        <button
          type="button"
          className="context-projects-add-btn"
          disabled={
            internetLoading ||
            secondaryLoading ||
            !internetQuery.trim()
          }
          onClick={() => void runInternetSearch()}
        >
          {internetLoading ? "…" : "Run"}
        </button>
      </div>
      {internetResp?.notices.includes(TAURI_ONLY_NOTICE) && (
        <p className="context-error">
          Targeted search runs in the Tauri desktop app only (not the browser dev
          server).
        </p>
      )}
      {internetResp && internetResp.providersTried.length > 0 && (
        <p className="context-projects-hint">
          Providers tried: {internetResp.providersTried.join(", ")}
        </p>
      )}
      {internetResp && internetResp.notices.length > 0 && (
        <ul className="context-internet-notices">
          {internetResp.notices.map((n, idx) => (
            <li key={`${idx}-${n}`}>{n}</li>
          ))}
        </ul>
      )}
      {internetResp && internetResp.hits.length > 0 && (
        <ul className="email-list context-internet-hit-list">
          {internetResp.hits.map((h) => {
            const u = h.url.trim();
            const snip = h.snippet?.trim() ?? "";
            const snipShort = snip.length > 160 ? `${snip.slice(0, 160)}…` : snip;
            return (
              <li
                key={u}
                className={`email-item ${internetPickUrls.has(u) ? "focused" : ""}`}
              >
                <label className="email-item-btn internet-hit-pick-label">
                  <input
                    type="checkbox"
                    checked={internetPickUrls.has(u)}
                    onChange={() => toggleInternetPick(u)}
                    aria-label={`Select ${h.title || u}`}
                  />
                  <span className="internet-hit-stack">
                    <div className="email-item-head">
                      <span className="email-from">[{h.source}]</span>
                    </div>
                    <a
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="email-subject context-internet-hit-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {h.title || u}
                    </a>
                    {snipShort ? (
                      <span className="email-snippet">{snipShort}</span>
                    ) : null}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {secondaryLoading ? (
        <p className="context-projects-hint" role="status">
          Running section searches…
        </p>
      ) : null}
      <div className="context-internet-actions">
        <button
          type="button"
          className="context-projects-add-btn"
          disabled={
            !internetResp ||
            internetResp.hits.length === 0 ||
            internetPickUrls.size === 0 ||
            secondaryLoading
          }
          onClick={addInternetSelectionToContext}
        >
          Add selected to context
        </button>
        {secondaryAction ? (
          <button
            type="button"
            className="context-projects-add-btn"
            disabled={
              !internetResp ||
              internetResp.hits.length === 0 ||
              internetPickUrls.size === 0 ||
              secondaryLoading
            }
            onClick={() => void applySecondary()}
          >
            {secondaryLoading ? "…" : secondaryAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
