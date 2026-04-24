/**
 * Lightweight, deterministic intent hints for tool repair and prompt closing.
 * Not a full NLU layer — regex heuristics on the latest user message.
 */

export type TurnToolIntent = "creation" | "fact_save" | "email_fetch" | "none";

/**
 * Classify the user's last message for tool routing hints.
 */
export function detectTurnToolIntent(userMessage: string): TurnToolIntent {
  const t = userMessage.trim().toLowerCase();
  if (!t) return "none";

  if (
    /\b(create|make|build|craft|design)\s+(a\s+|an\s+|the\s+)?(new\s+)?(avatar|persona|character)\b/.test(
      t
    ) ||
    /\bnew\s+avatar\b/.test(t) ||
    /\bopen\s+(the\s+)?(creation|avatar)\s+workshop\b/.test(t) ||
    /\bstart\s+(a\s+)?(new\s+)?avatar\b/.test(t)
  ) {
    return "creation";
  }

  if (
    /\b(fetch|open|read|show)\s+(the\s+|this\s+|that\s+)?(full\s+)?(email|message|mail)\b/.test(
      t
    ) ||
    /\bemail\s+body\b/.test(t) ||
    /\bgmail\b.*\b(fetch|open|read)\b/.test(t)
  ) {
    return "email_fetch";
  }

  if (
    /\b(remember|save|store|note|jot)\s+(that\s+)?/i.test(userMessage) ||
    /\bupdate\s+(my\s+)?profile\b/.test(t) ||
    /\badd\s+(a\s+)?(new\s+)?project\b/.test(t) ||
    /\btrack\s+(this\s+)?project\b/.test(t)
  ) {
    return "fact_save";
  }

  return "none";
}
