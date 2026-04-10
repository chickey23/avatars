/**
 * Calendar context scoring — rank upcoming events vs Situation Context for prompt relevance (SPEC § Context scoring agents).
 */

import type { CalendarEvent } from "../../connectors/types";
import type { ConversationMessage, SituationFocus } from "../../types";

/** Max calendar lines injected into `relevantData` per turn */
export const CALENDAR_CONTEXT_TOP_K = 5;

/** How many tail messages contribute to the keyword corpus */
export const CALENDAR_THREAD_TAIL_DEFAULT = 15;

const FOCUS_ID_MATCH_BONUS = 10_000;
const MAX_OVERLAP_POINTS = 80;
const POINTS_PER_KEYWORD_HIT = 4;

export type CalendarScoringContext = {
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

function buildCorpus(ctx: CalendarScoringContext): string {
  const n = ctx.threadTailSize ?? CALENDAR_THREAD_TAIL_DEFAULT;
  const tail = ctx.conversationThread.slice(-n);
  const parts: string[] = [];
  if (ctx.activeTask?.trim()) parts.push(ctx.activeTask.trim());
  for (const m of tail) {
    parts.push(m.content);
  }
  return parts.join(" \n ").toLowerCase();
}

/** Stable, English UI string for overlap and for human-readable lines */
export function formatEventStart(startMs: number): string {
  return new Date(startMs).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function overlapScore(corpus: string, text: string): number {
  const words = new Set(tokenize(text));
  let hits = 0;
  for (const w of words) {
    if (corpus.includes(w)) hits++;
  }
  return Math.min(MAX_OVERLAP_POINTS, hits * POINTS_PER_KEYWORD_HIT);
}

export function scoreCalendarEvents(
  events: CalendarEvent[],
  ctx: CalendarScoringContext
): Array<{ event: CalendarEvent; score: number }> {
  const corpus = buildCorpus(ctx);
  const focusCalendarId = ctx.focus?.calendar?.id;

  return events.map((event) => {
    let score = 0;
    if (focusCalendarId && event.id === focusCalendarId) {
      score += FOCUS_ID_MATCH_BONUS;
    }
    const timeStr = formatEventStart(event.start);
    const blob = `${event.title} ${event.location ?? ""} ${timeStr}`;
    score += overlapScore(corpus, blob);
    return { event, score };
  });
}

/**
 * Sort by score (then sooner `start`), take top K, format for `relevantData`.
 * Score shown 0–100 is normalized against the max score in this batch.
 */
export function scoreAndFormatCalendarEvents(
  events: CalendarEvent[],
  ctx: CalendarScoringContext,
  topK: number = CALENDAR_CONTEXT_TOP_K
): string[] {
  if (events.length === 0) return [];
  const scored = scoreCalendarEvents(events, ctx);
  scored.sort((a, b) => b.score - a.score || a.event.start - b.event.start);
  const maxScore = Math.max(...scored.map((s) => s.score), 1);
  return scored.slice(0, topK).map(({ event, score }, i) => {
    const rank = i + 1;
    const norm = Math.round((100 * score) / maxScore);
    const title = event.title.trim() || "(no title)";
    const loc = event.location?.replace(/\s+/g, " ").trim();
    const when = formatEventStart(event.start);
    const locPart = loc ? ` — ${loc}` : "";
    return `calendar [rank ${rank}, score ${norm}]: ${title}${locPart} (${when})`;
  });
}
