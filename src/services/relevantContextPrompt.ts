/**
 * Build the "Relevant context" block for Ollama. Email full-body lines must not be
 * truncated by the line budget (they are appended late in `relevantData` arrays).
 */

/** Prefix for lines that contain a full fetched Gmail body in `relevantData`. */
export const EMAIL_BODY_RELEVANCE_PREFIX = "Email body [";

/** Ranked inbox one-liners from `formatRankedEmailLine` — never drop these to the line budget. */
const EMAIL_RANK_LINE_PREFIX = "email [id ";

const MAX_OTHER_RELEVANT_LINES = 25;

/** Per full body block after the `Email body [id]:` header — keeps localhost Ollama from huge payloads. */
const MAX_EMAIL_BODY_CONTENT_CHARS = 14_000;

/** Focused-email digest lines from prep (must not be dropped by the line budget). */
const FOCUS_EMAIL_DIGEST_PREFIXES = [
  "Email summary [",
  "Email key fields [",
  "Email excerpt [",
] as const;

function selectOtherRelevanceLines(other: string[]): string[] {
  const out: string[] = [];
  let nonEmailRankCount = 0;
  for (const line of other) {
    const isEmailRank = line.startsWith(EMAIL_RANK_LINE_PREFIX);
    if (isEmailRank) {
      out.push(line);
      continue;
    }
    const isFocusEmailDigest = FOCUS_EMAIL_DIGEST_PREFIXES.some((p) => line.startsWith(p));
    if (isFocusEmailDigest) {
      out.push(line);
      continue;
    }
    if (nonEmailRankCount < MAX_OTHER_RELEVANT_LINES) {
      out.push(line);
      nonEmailRankCount++;
    }
  }
  return out;
}

function truncateEmailBodyBlock(line: string): string {
  if (!line.startsWith(EMAIL_BODY_RELEVANCE_PREFIX)) return line;
  const nl = line.indexOf("\n");
  if (nl < 0) return line;
  const header = line.slice(0, nl + 1);
  let body = line.slice(nl + 1);
  if (body.length <= MAX_EMAIL_BODY_CONTENT_CHARS) return line;
  body =
    body.slice(0, MAX_EMAIL_BODY_CONTENT_CHARS) +
    "\n\n[truncated for prompt size]";
  return header + body;
}

export function formatRelevantDataForOllamaPrompt(relevant?: string[]): string {
  if (!relevant?.length) return "";
  const bodyBlocks = relevant
    .filter((s) => s.startsWith(EMAIL_BODY_RELEVANCE_PREFIX))
    .map(truncateEmailBodyBlock);
  const other = relevant.filter(
    (s) => !s.startsWith(EMAIL_BODY_RELEVANCE_PREFIX)
  );
  const otherShown = selectOtherRelevanceLines(other);
  const pieces: string[] = [];
  if (otherShown.length) {
    pieces.push(otherShown.join("\n"));
  }
  if (bodyBlocks.length) {
    pieces.push(bodyBlocks.join("\n\n"));
  }
  if (pieces.length === 0) return "";
  return `Relevant context (connector data; lines starting with "focus:" are Focus; "User profile (local):" is the saved user profile; "Email body [id]:" blocks are full fetched message text when present):\n${pieces.join("\n\n---\n\n")}`;
}
