/**
 * User-pinned web/wiki lines merged into `relevantData` (Context → Internet).
 * Prefix is stable for rule blocks; see docs/EXTENDING_TRAITS_AND_RULES.md.
 */

import type { TargetedSearchHit } from "./targetedSearch";

/** First segment of each line; keep in sync with docs and AI rule blocks. */
export const INTERNET_CONTEXT_LINE_PREFIX = "Internet context";

/**
 * `Internet context [source]: title — URL` plus optional snippet on the next line.
 */
export function formatInternetContextLine(hit: TargetedSearchHit): string {
  const title = hit.title.trim() || "(untitled)";
  const url = hit.url.trim();
  const snip = hit.snippet.trim().slice(0, 280);
  const head = `${INTERNET_CONTEXT_LINE_PREFIX} [${hit.source}]: ${title} — ${url}`;
  return snip ? `${head}\n${snip}` : head;
}

/** URL is the substring after the last ` — ` on the first line. */
export function extractUrlFromInternetContextLine(line: string): string | null {
  const first = line.split("\n")[0] ?? line;
  const sep = " — ";
  const i = first.lastIndexOf(sep);
  if (i < 0) return null;
  const u = first.slice(i + sep.length).trim();
  return u.length > 0 ? u : null;
}

const DISPLAY_TITLE_MAX = 72;

/** Short label for UI (Focus row, etc.) parsed from a stored context line. */
export function internetContextLineDisplayTitle(line: string): string {
  const first = line.split("\n")[0] ?? line;
  const m = first.match(
    /^Internet context \[[^\]]+\]:\s*(.+)\s+—\s+(https?:\/\/\S+)$/i
  );
  const raw = (m?.[1] ?? first).trim();
  if (!raw) return "Web";
  return raw.length > DISPLAY_TITLE_MAX
    ? `${raw.slice(0, DISPLAY_TITLE_MAX - 1)}…`
    : raw;
}

/** Append incoming lines; skip URLs already present on any existing line. */
export function mergePinnedInternetLines(
  existing: string[] | undefined,
  incoming: string[]
): string[] {
  const urls = new Set<string>();
  for (const line of existing ?? []) {
    const u = extractUrlFromInternetContextLine(line);
    if (u) urls.add(u);
  }
  const out = [...(existing ?? [])];
  for (const line of incoming) {
    const u = extractUrlFromInternetContextLine(line);
    if (u && urls.has(u)) continue;
    if (u) urls.add(u);
    out.push(line);
  }
  return out;
}
