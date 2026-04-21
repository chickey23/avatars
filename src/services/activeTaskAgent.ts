/**
 * Lightweight Active Task inference from the user message (SPEC § Active Task Agent, MVP heuristic).
 * Does not replace manual `activeTask` unless the heuristic is confident.
 */

const PATTERNS: RegExp[] = [
  /(?:^|\b)(?:i am|i'm|we are|we're)\s+(?:working on|focused on|doing)\s+[:.]?\s*(.+?)(?:[.!]|$)/i,
  /(?:^|\b)(?:let's|let us)\s+(?:focus on|work on)\s+[:.]?\s*(.+?)(?:[.!]|$)/i,
  /(?:^|\b)active task\s*:\s*(.+?)(?:[.!]|$)/i,
];

function trimCandidate(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length > 200) return t.slice(0, 197).trimEnd() + "…";
  return t;
}

/**
 * Returns a suggested active task string, or `undefined` to leave unchanged.
 */
export function suggestActiveTaskFromUserMessage(
  userContent: string,
  _previousActive?: string
): string | undefined {
  const raw = userContent.trim();
  if (raw.length < 8) return undefined;

  for (const re of PATTERNS) {
    const m = raw.match(re);
    if (m?.[1]) {
      const c = trimCandidate(m[1]);
      if (c.length >= 3) return c;
    }
  }
  return undefined;
}
