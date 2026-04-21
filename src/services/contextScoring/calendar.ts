/**
 * Calendar context scoring — rank upcoming events vs Situation Context for prompt relevance (SPEC § Context scoring agents).
 */

import type { CalendarEvent } from "../../connectors/types";
import type { ConversationMessage, SituationFocus } from "../../types";
import {
  FOCUS_ID_MATCH_BONUS,
  softBonusForCalendar,
  type FocusSoftSignals,
} from "./focusRelevance";
import { computeNormFocusDisplays } from "./normFocus";

export { FOCUS_ID_MATCH_BONUS } from "./focusRelevance";

/** Max calendar lines injected into `relevantData` per turn */
export const CALENDAR_CONTEXT_TOP_K = 5;

/** How many tail messages contribute to the keyword corpus */
export const CALENDAR_THREAD_TAIL_DEFAULT = 15;

const MAX_OVERLAP_POINTS = 80;
const POINTS_PER_KEYWORD_HIT = 4;

export type CalendarScoringContext = {
  focus?: SituationFocus;
  conversationThread: ConversationMessage[];
  activeTask?: string;
  threadTailSize?: number;
  focusCorpusAppendix?: string;
  worldMetadataCorpus?: string;
  focusSoft?: FocusSoftSignals;
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
  let s = parts.join(" \n ").toLowerCase();
  if (ctx.focusCorpusAppendix?.trim()) {
    s = `${s} \n ${ctx.focusCorpusAppendix.trim().toLowerCase()}`;
  }
  if (ctx.worldMetadataCorpus?.trim()) {
    s = `${s} \n ${ctx.worldMetadataCorpus.trim().toLowerCase()}`;
  }
  return s;
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
  const sig = ctx.focusSoft;

  return events.map((event) => {
    let score = 0;
    if (focusCalendarId && event.id === focusCalendarId) {
      score += FOCUS_ID_MATCH_BONUS;
    }
    const timeStr = formatEventStart(event.start);
    const blob = `${event.title} ${event.location ?? ""} ${timeStr}`;
    score += overlapScore(corpus, blob);
    score += softBonusForCalendar(event, blob.toLowerCase(), sig);
    return { event, score };
  });
}

export type RankedCalendarForContext = {
  event: CalendarEvent;
  rawScore: number;
  normScore: number;
  normFocus: number;
  rank: number;
};

export function rankCalendarForContext(
  events: CalendarEvent[],
  ctx: CalendarScoringContext,
  topK: number = CALENDAR_CONTEXT_TOP_K
): RankedCalendarForContext[] {
  if (events.length === 0) return [];
  const scored = scoreCalendarEvents(events, ctx);
  scored.sort((a, b) => b.score - a.score || a.event.start - b.event.start);
  const slice = scored.slice(0, topK);
  const focusCalendarId = ctx.focus?.calendar?.id;
  const rawScores = slice.map((s) => s.score);
  const focusFlags = slice.map(
    (s) => Boolean(focusCalendarId && s.event.id === focusCalendarId)
  );
  const normFocusList = computeNormFocusDisplays(rawScores, focusFlags);
  const maxScore = Math.max(...rawScores, 1);
  return slice.map((s, i) => ({
    event: s.event,
    rawScore: s.score,
    normScore: Math.round((100 * s.score) / maxScore),
    normFocus: normFocusList[i]!,
    rank: i + 1,
  }));
}

function formatRankedCalendarLine(r: RankedCalendarForContext): string {
  const { event, normFocus, rank } = r;
  const title = event.title.trim() || "(no title)";
  const loc = event.location?.replace(/\s+/g, " ").trim();
  const when = formatEventStart(event.start);
  const locPart = loc ? ` — ${loc}` : "";
  return `calendar [rank ${rank}, score ${normFocus}]: ${title}${locPart} (${when})`;
}

/**
 * Sort by score (then sooner `start`), take top K, format for `relevantData`.
 * `score` in each line is focus-relative.
 */
export function scoreAndFormatCalendarEvents(
  events: CalendarEvent[],
  ctx: CalendarScoringContext,
  topK: number = CALENDAR_CONTEXT_TOP_K
): string[] {
  return rankCalendarForContext(events, ctx, topK).map(formatRankedCalendarLine);
}
