/**
 * @deprecated Legacy set discovery: targeted-search prose + heuristic filters.
 * Prefer structured resolution (Wikidata-backed cast lists) with a small
 * acceptance predicate over growing blocklists; see docs/STYLEGUIDE.md §4.
 *
 * `discoverSetMembersFromHits` remains for tests and CLI probes.
 */

import {
  runTargetedSearch,
  TAURI_ONLY_NOTICE,
  type TargetedSearchResponse,
} from "../targetedSearch";

const JUNK_SUBSTRINGS = [
  "wikipedia",
  "google search",
  "search results",
  "fandom powered",
  "imdb",
  "the free encyclopedia",
  "cookie policy",
  "privacy policy",
  "read more",
  "subscribe",
  "sign in",
  "all access",
  "star trek",
];

/** Dropped when deriving stopwords from the discovery query (scaffolding). */
export const STOPWORDS_FROM_QUERY_DROP = new Set(
  (
    "a an the of for and main crew cast members characters list group team ensemble primary named called with from into about " +
    "create avatars new avatar uses using"
  )
    .split(/\s+/)
    .filter(Boolean)
);

const JUNK_TITLE_PREFIXES = [
  "list of",
  "category:",
  "wikipedia:",
  "talk:",
  "template:",
  "portal:",
];

const JUNK_TITLE_PATTERNS: RegExp[] = [
  /\bseason\s+\d+\b/i,
  /\bepisodes?\b/i,
  /\bvolumes?\s+\d+\b/i,
  /\bbook\s+\d+\b/i,
  /\bpart\s+\d+\b/i,
  /\bcast\b/i,
  /\bsoundtrack\b/i,
  /\ball access\b/i,
  /\bseries\b/i,
  /\bfranchise\b/i,
  /\bstar\s+trek\b/i,
];

export type DiscoverSetMembersResult = {
  names: string[];
  sourceLines: string[];
  notices: string[];
};

/** Title-case multi-word phrases (common character / cast naming). */
const TITLE_CASE_NAME_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;

const WORD_SHAPE_RE = /^[A-Z][a-z]+$/;

function isJunkName(name: string): boolean {
  const low = name.toLowerCase().trim();
  if (low.length < 4) return true;
  for (const j of JUNK_SUBSTRINGS) {
    if (low.includes(j)) return true;
  }
  return false;
}

/**
 * Tokens from the discovery query that identify the franchise/set — used to
 * reject page titles that repeat the show name (e.g. "Lower Decks").
 */
export function deriveStopwordsFromQuery(query: string): Set<string> {
  const raw = query.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const out = new Set<string>();
  for (const t of raw) {
    if (t.length < 3) continue;
    if (STOPWORDS_FROM_QUERY_DROP.has(t)) continue;
    out.add(t);
  }
  return out;
}

/**
 * True when the string looks like a 2–4 word person-style name, passes junk
 * checks, and does not reuse query stopwords (franchise / topic tokens).
 */
export function looksLikePersonName(
  name: string,
  stopwords: ReadonlySet<string>
): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 4) return false;
  if (/[0-9:[(,]/.test(trimmed)) return false;

  const low = trimmed.toLowerCase();
  for (const p of JUNK_TITLE_PREFIXES) {
    if (low.startsWith(p)) return false;
  }
  for (const re of JUNK_TITLE_PATTERNS) {
    if (re.test(trimmed)) return false;
  }
  if (isJunkName(trimmed)) return false;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  for (const w of words) {
    if (!WORD_SHAPE_RE.test(w)) return false;
    const wl = w.toLowerCase();
    if (stopwords.has(wl)) return false;
  }
  return true;
}

/** Strip trailing parenthetical disambiguators from page titles. */
export function stripTrailingParenthetical(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/g, "").trim();
}

/**
 * First segment of a search hit title (before " - Wikipedia", " | …").
 */
export function primaryTitleSegment(title: string): string {
  const stripped = stripTrailingParenthetical(title.trim());
  const seg = stripped.split(/\s*[-|–—]\s*/)[0]!.trim();
  return seg;
}

/**
 * Heuristic extraction of person-like names from search titles + snippets.
 * Exported for unit tests.
 */
export function extractNamesFromSearchCorpus(
  corpus: string,
  stopwords: ReadonlySet<string>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of corpus.matchAll(TITLE_CASE_NAME_RE)) {
    const raw = m[1]!.trim();
    if (!looksLikePersonName(raw, stopwords)) continue;
    const key = raw.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(raw);
    if (out.length >= 32) break;
  }
  return out;
}

function collectCorpusFromHits(
  hits: { title: string; snippet: string }[]
): string {
  const parts: string[] = [];
  for (const h of hits) {
    const head = primaryTitleSegment(h.title);
    if (head) parts.push(head);
    parts.push(h.title);
    if (h.snippet?.trim()) parts.push(h.snippet);
  }
  return parts.join("\n");
}

function namesFromHitTitles(
  hits: { title: string; snippet: string }[],
  stopwords: ReadonlySet<string>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hits) {
    const seg = primaryTitleSegment(h.title);
    if (!seg || !looksLikePersonName(seg, stopwords)) continue;
    const key = seg.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(seg);
    if (out.length >= 24) break;
  }
  return out;
}

/**
 * Pure pipeline: given a search response, derive candidate names and source
 * lines. Used by the async wrapper, Vitest, and CLI probes.
 */
export function discoverSetMembersFromHits(
  query: string,
  res: TargetedSearchResponse
): DiscoverSetMembersResult {
  const q = query.trim();
  const stopwords = deriveStopwordsFromQuery(q);
  const sourceLines: string[] = [];
  for (const n of res.notices) {
    sourceLines.push(`notice: ${n}`);
  }
  for (const h of res.hits) {
    sourceLines.push(`- ${h.title} (${h.url})`);
    const sn = h.snippet?.trim();
    if (sn) sourceLines.push(`  ${sn.slice(0, 220)}`);
  }

  const fromTitles = namesFromHitTitles(res.hits, stopwords);
  const corpus = collectCorpusFromHits(res.hits);
  const fromCorpus = extractNamesFromSearchCorpus(corpus, stopwords);

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const n of [...fromTitles, ...fromCorpus]) {
    if (!looksLikePersonName(n, stopwords)) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(n);
    if (merged.length >= 25) break;
  }

  return {
    names: merged,
    sourceLines,
    notices: res.notices,
  };
}

/**
 * Runs targeted search and extracts a deduped candidate name list plus short
 * source lines for the review card.
 */
export async function discoverSetMembers(
  query: string,
  options?: { maxResults?: number }
): Promise<DiscoverSetMembersResult> {
  const q = query.trim();
  if (!q) {
    return { names: [], sourceLines: ["notice: query_empty"], notices: ["query_empty"] };
  }

  const res = await runTargetedSearch(q, options?.maxResults ?? 12);
  return discoverSetMembersFromHits(q, res);
}

export { TAURI_ONLY_NOTICE };
