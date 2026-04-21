import type { WorldviewToolCall } from "./worldviewTools/parse";

const MAX_STRING = 380;
const MAX_JSON_CHARS = 9000;

function deepTruncateStrings(value: unknown, maxLen: number): unknown {
  if (typeof value === "string") {
    return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => deepTruncateStrings(v, maxLen));
  }
  if (value !== null && typeof value === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      o[k] = deepTruncateStrings(v, maxLen);
    }
    return o;
  }
  return value;
}

/**
 * Human-readable JSON of tool args for the WV audit log (truncated; local only).
 */
export function formatWorldviewToolArgsForAudit(t: WorldviewToolCall): string {
  const body = deepTruncateStrings(t.args, MAX_STRING);
  let s: string;
  try {
    s = JSON.stringify(body, null, 2);
  } catch {
    s = String(body);
  }
  if (s.length > MAX_JSON_CHARS) {
    return `${s.slice(0, MAX_JSON_CHARS - 2)}…`;
  }
  return s;
}
