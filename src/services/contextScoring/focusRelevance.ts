/**
 * Deterministic focus proximity for context scoring (corpus + soft signals).
 */

import type { CalendarEvent, EmailItem } from "../../connectors/types";
import type { SituationFocus } from "../../types";

export const FOCUS_ID_MATCH_BONUS = 10_000;

/** Extra corpus text from the focused item so overlap does not depend only on chat tail. */
export const FOCUS_EMAIL_BODY_EXCERPT_MAX = 2500;

const POINTS_PER_LOCATION_HIT = 6;
const MAX_LOCATION_BONUS = 36;

const SAME_DAY_BONUS = 14;
const ADJ_DAY_BONUS = 7;

const CAL_TIME_WINDOW_MS = 18 * 60 * 60 * 1000;
const CAL_WINDOW_BONUS = 22;
const CAL_WINDOW_WEAK = 10;

export type FocusSoftSignals = {
  /** Tokens from focused item (venue-ish words, show names, etc.). */
  locationTokens: string[];
  /** Focused email's sent/received time when known. */
  focusEmailDateMs?: number;
  /** Focused calendar range when known. */
  focusCalendarStartMs?: number;
  focusCalendarEndMs?: number;
};

function tokenize(s: string, minLen = 3): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9@.+_-]+/i)
    .filter((w) => w.length >= minLen);
}

/** Venue / address fragments from a calendar-style location string. */
export function extractLocationTokens(location: string | undefined): string[] {
  if (!location?.trim()) return [];
  const raw = location.replace(/\s+/g, " ").trim().toLowerCase();
  const words = tokenize(raw, 4);
  const out = new Set<string>();
  for (const w of words) out.add(w);
  for (const chunk of raw.split(/[,;/|]+/)) {
    const t = chunk.trim();
    if (t.length >= 4) out.add(t);
  }
  return [...out];
}

/**
 * Build extra lowercase text folded into the keyword corpus (thread + task + …).
 */
export function buildFocusCorpusAppendix(args: {
  focus: SituationFocus;
  focusEmailRow?: EmailItem;
  focusEmailBodyExcerpt?: string;
  focusCalendarRow?: CalendarEvent;
}): string {
  const parts: string[] = [];
  const fe = args.focus.email;
  if (fe) {
    const row = args.focusEmailRow;
    const subj = row?.subject?.trim() || fe.title?.trim() || "";
    const snip =
      row?.snippet?.trim() || fe.snippet?.trim() || row?.snippet || "";
    const from = row?.from?.trim() || "";
    if (subj) parts.push(subj);
    if (snip) parts.push(snip);
    if (from) parts.push(from);
    const ex = args.focusEmailBodyExcerpt?.trim();
    if (ex) parts.push(ex.slice(0, FOCUS_EMAIL_BODY_EXCERPT_MAX));
  }
  const fc = args.focus.calendar;
  if (fc) {
    const row = args.focusCalendarRow;
    const title = row?.title?.trim() || fc.title?.trim() || "";
    const loc = row?.location?.trim();
    if (title) parts.push(title);
    if (loc) parts.push(loc);
    if (row) {
      parts.push(new Date(row.start).toISOString());
      parts.push(new Date(row.end).toISOString());
    }
  }
  return parts.join(" \n ").toLowerCase();
}

/**
 * Soft-signal source for same-venue / same-window scoring. For email-only focus,
 * derives rich tokens from subject + snippet (EmailItem has no `location` field).
 */
export function buildFocusSoftSignals(args: {
  focus: SituationFocus;
  focusEmailRow?: EmailItem;
  focusCalendarRow?: CalendarEvent;
}): FocusSoftSignals | undefined {
  const { focus, focusEmailRow, focusCalendarRow } = args;
  const tokens: string[] = [];
  let focusEmailDateMs: number | undefined;
  let focusCalendarStartMs: number | undefined;
  let focusCalendarEndMs: number | undefined;

  if (focus.calendar) {
    const row = focusCalendarRow;
    if (row) {
      focusCalendarStartMs = row.start;
      focusCalendarEndMs = row.end;
      tokens.push(...extractLocationTokens(row.location));
      tokens.push(...tokenize(row.title, 4));
    } else if (focus.calendar.title) {
      tokens.push(...tokenize(focus.calendar.title, 4));
    }
  }
  if (focus.email) {
    const row = focusEmailRow;
    const subj = row?.subject?.trim() ?? focus.email.title?.trim() ?? "";
    const snip =
      row?.snippet?.trim() ??
      focus.email.snippet?.trim() ??
      row?.snippet ??
      "";
    const blob = `${subj} ${snip}`;
    tokens.push(
      ...tokenize(blob, 4).filter((w) => w.length >= 5)
    );
    if (row?.date != null) focusEmailDateMs = row.date;
  }

  const locationTokens = [...new Set(tokens)].slice(0, 24);
  const hasCal =
    focusCalendarStartMs != null &&
    focusCalendarEndMs != null &&
    Number.isFinite(focusCalendarStartMs) &&
    Number.isFinite(focusCalendarEndMs);
  if (
    locationTokens.length === 0 &&
    focusEmailDateMs == null &&
    !hasCal
  ) {
    return undefined;
  }
  return {
    locationTokens,
    focusEmailDateMs,
    focusCalendarStartMs,
    focusCalendarEndMs,
  };
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate()
  ).getTime();
}

function calendarDaysApart(aMs: number, bMs: number): number {
  const a = startOfLocalDay(aMs);
  const b = startOfLocalDay(bMs);
  return Math.round(Math.abs(a - b) / (24 * 60 * 60 * 1000));
}

export function softBonusForEmail(
  email: EmailItem,
  blobLower: string,
  sig: FocusSoftSignals | undefined
): number {
  if (!sig) return 0;
  let bonus = 0;
  if (sig.locationTokens.length) {
    let hits = 0;
    for (const t of sig.locationTokens) {
      if (t.length >= 4 && blobLower.includes(t)) hits++;
    }
    bonus += Math.min(
      MAX_LOCATION_BONUS,
      hits * POINTS_PER_LOCATION_HIT
    );
  }
  if (sig.focusEmailDateMs != null && email.date != null) {
    const d = calendarDaysApart(sig.focusEmailDateMs, email.date);
    if (d === 0) bonus += SAME_DAY_BONUS;
    else if (d === 1) bonus += ADJ_DAY_BONUS;
  }
  return bonus;
}

export function softBonusForCalendar(
  event: CalendarEvent,
  blobLower: string,
  sig: FocusSoftSignals | undefined
): number {
  if (!sig) return 0;
  let bonus = 0;
  if (sig.locationTokens.length) {
    let hits = 0;
    for (const t of sig.locationTokens) {
      if (t.length >= 4 && blobLower.includes(t)) hits++;
    }
    bonus += Math.min(
      MAX_LOCATION_BONUS,
      hits * POINTS_PER_LOCATION_HIT
    );
  }
  const fs = sig.focusCalendarStartMs;
  const fe = sig.focusCalendarEndMs;
  if (
    fs != null &&
    fe != null &&
    Number.isFinite(fs) &&
    Number.isFinite(fe)
  ) {
    const mid = (event.start + event.end) / 2;
    if (mid >= fs && mid <= fe) bonus += CAL_WINDOW_BONUS;
    else {
      const dist = Math.min(
        Math.abs(event.start - fs),
        Math.abs(event.start - fe),
        Math.abs(event.end - fs),
        Math.abs(event.end - fe)
      );
      if (dist <= CAL_TIME_WINDOW_MS) bonus += CAL_WINDOW_WEAK;
    }
  }
  return bonus;
}
