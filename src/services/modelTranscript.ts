import { diagnoseWorldviewToolReply } from "./worldviewTools/diagnose";
import { splitWorldviewToolsFromReply } from "./worldviewTools/parse";

const REDACTED = "[tool attempt redacted]";

function countTripleBackticks(s: string): number {
  const m = s.match(/```/g);
  return m?.length ?? 0;
}

/**
 * True when this avatar message should not be shown to the model as-is
 * (likely to cause imitation of bad tool prose or malformed JSON).
 */
export function shouldScrubAvatarLineForModel(content: string): boolean {
  const t = content.trim();
  if (!t) return false;

  if (/\bwikipedia\.search\b/i.test(t)) return true;

  const { envelope } = splitWorldviewToolsFromReply(t);
  const diag = diagnoseWorldviewToolReply(t, envelope);
  if (diag.hints.length > 0) return true;

  if (/\*\*json\*\*/i.test(t) && !envelope) return true;

  const fences = countTripleBackticks(t);
  if (fences % 2 !== 0) return true;

  return false;
}

export type ConversationLine = { role: string; content: string };

/**
 * Redact prior avatar lines that look like failed / leaky tool attempts.
 * User-facing `conversationThread` is unchanged; only the copy passed to the LLM.
 */
export function scrubTranscriptForModel(messages: ConversationLine[]): ConversationLine[] {
  return messages.map((m) => {
    if (m.role !== "avatar") return m;
    if (!shouldScrubAvatarLineForModel(m.content)) return m;
    return { ...m, content: REDACTED };
  });
}
