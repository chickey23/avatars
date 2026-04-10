/**
 * Email context scoring — rank recent messages vs Situation Context for prompt relevance (SPEC § Context scoring agents, email first).
 */

import type { EmailItem } from "../../connectors/types";
import type { ConversationMessage, SituationFocus } from "../../types";

/** Max email lines injected into `relevantData` per turn */
export const EMAIL_CONTEXT_TOP_K = 5;

/** How many tail messages contribute to the keyword corpus */
export const EMAIL_THREAD_TAIL_DEFAULT = 15;

const FOCUS_ID_MATCH_BONUS = 10_000;
const MAX_OVERLAP_POINTS = 80;
const POINTS_PER_KEYWORD_HIT = 4;

export type EmailScoringContext = {
  focus?: SituationFocus;
  conversationThread: ConversationMessage[];
  activeTask?: string;
  threadTailSize?: number;
};

function tokenize(s: string, minLen = 3): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9@.+_-]+/i)
    .filter((w) => w.length >= minLen);
}

function buildCorpus(ctx: EmailScoringContext): string {
  const n = ctx.threadTailSize ?? EMAIL_THREAD_TAIL_DEFAULT;
  const tail = ctx.conversationThread.slice(-n);
  const parts: string[] = [];
  if (ctx.activeTask?.trim()) parts.push(ctx.activeTask.trim());
  for (const m of tail) {
    parts.push(m.content);
  }
  return parts.join(" \n ").toLowerCase();
}

function overlapScore(corpus: string, text: string): number {
  const words = new Set(tokenize(text));
  let hits = 0;
  for (const w of words) {
    if (corpus.includes(w)) hits++;
  }
  return Math.min(MAX_OVERLAP_POINTS, hits * POINTS_PER_KEYWORD_HIT);
}

export function scoreEmailItems(
  emails: EmailItem[],
  ctx: EmailScoringContext
): Array<{ email: EmailItem; score: number }> {
  const corpus = buildCorpus(ctx);
  const focusEmailId = ctx.focus?.email?.id;

  return emails.map((email) => {
    let score = 0;
    if (focusEmailId && email.id === focusEmailId) {
      score += FOCUS_ID_MATCH_BONUS;
    }
    const blob = `${email.from} ${email.subject} ${email.snippet}`;
    score += overlapScore(corpus, blob);
    return { email, score };
  });
}

/**
 * Sort by score (then newer `date`), take top K, format for `relevantData`.
 * Score shown 0–100 is normalized against the max score in this batch.
 */
export function scoreAndFormatEmails(
  emails: EmailItem[],
  ctx: EmailScoringContext,
  topK: number = EMAIL_CONTEXT_TOP_K
): string[] {
  if (emails.length === 0) return [];
  const scored = scoreEmailItems(emails, ctx);
  scored.sort((a, b) => b.score - a.score || b.email.date - a.email.date);
  const maxScore = Math.max(...scored.map((s) => s.score), 1);
  return scored.slice(0, topK).map(({ email, score }, i) => {
    const rank = i + 1;
    const norm = Math.round((100 * score) / maxScore);
    const subj = email.subject.trim() || "(no subject)";
    const snip = email.snippet.replace(/\s+/g, " ").trim().slice(0, 120);
    return `email [rank ${rank}, score ${norm}]: ${subj} — ${snip} (from ${email.from})`;
  });
}
