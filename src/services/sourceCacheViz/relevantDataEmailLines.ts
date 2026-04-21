/**
 * Phase A fallback: extract ranked inbox lines from `relevantData` when
 * `lastEmailRankingDiagnostics` is missing (e.g. older persisted sessions).
 */

const EMAIL_RANK_LINE_PREFIX = "email [id ";

export type ParsedRankedEmailLine = {
  emailId: string;
  rank: number;
  score: number;
  rest: string;
};

/** Matches `formatRankedEmailLine` output. */
const RANKED_LINE_RE =
  /^email \[id ([^,]+), rank (\d+), score (\d+)\]:\s*(.*)$/;

export function parseRankedEmailLinesFromRelevantData(
  relevantData: string[] | undefined
): ParsedRankedEmailLine[] {
  if (!relevantData?.length) return [];
  const out: ParsedRankedEmailLine[] = [];
  for (const line of relevantData) {
    if (!line.startsWith(EMAIL_RANK_LINE_PREFIX)) continue;
    const m = line.match(RANKED_LINE_RE);
    if (!m) continue;
    const emailId = m[1]!.trim();
    const rank = parseInt(m[2]!, 10);
    const score = parseInt(m[3]!, 10);
    if (!emailId || Number.isNaN(rank) || Number.isNaN(score)) continue;
    out.push({
      emailId,
      rank,
      score,
      rest: (m[4] ?? "").trim(),
    });
  }
  return out;
}
