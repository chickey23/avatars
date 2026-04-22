/**
 * Shared "background ranker" — gives runners a top-K without per-turn context.
 * The per-turn preprocessor still re-ranks with full situation/focus/thread
 * context; this one only uses world-metadata + user-profile text so that
 * top-K is a stable *background* signal for delta detection.
 */

import type {
  CalendarEvent,
  Contact,
  EmailItem,
} from "../../../connectors/types";
import {
  getWorldMetadata,
} from "../../worldMetadata/store";
import { userProfileToRelevanceLines } from "../../worldMetadata/userProfileRelevance";

const TOP_K = 5;

/** Rough, case-insensitive tokenized overlap against the background corpus. */
function backgroundCorpus(): string {
  const doc = getWorldMetadata();
  const parts: string[] = [];
  parts.push(...userProfileToRelevanceLines(doc.userProfile));
  for (const p of Object.values(doc.projects)) {
    parts.push(p.title);
    if (p.summary) parts.push(p.summary);
  }
  return parts.join(" \n ").toLowerCase();
}

function overlap(corpus: string, text: string): number {
  if (!corpus) return 0;
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9@.+_-]+/i)
    .filter((w) => w.length >= 3);
  if (tokens.length === 0) return 0;
  let hits = 0;
  for (const t of new Set(tokens)) {
    if (corpus.includes(t)) hits++;
  }
  return hits;
}

export function rankEmailsForBackground(
  items: EmailItem[]
): { topKIds: string[] } {
  const corpus = backgroundCorpus();
  const scored = items
    .map((e) => ({
      id: e.id,
      score: overlap(corpus, `${e.from} ${e.subject} ${e.snippet}`),
      date: e.date,
    }))
    .sort((a, b) => b.score - a.score || b.date - a.date);
  return { topKIds: scored.slice(0, TOP_K).map((s) => s.id) };
}

export function rankCalendarForBackground(
  items: CalendarEvent[]
): { topKIds: string[] } {
  const corpus = backgroundCorpus();
  const now = Date.now();
  const scored = items
    .map((c) => ({
      id: c.id,
      score: overlap(corpus, `${c.title} ${c.location ?? ""}`),
      /** Closer upcoming events rank higher when corpus overlap ties. */
      ttl: Math.max(0, c.start - now),
    }))
    .sort((a, b) => b.score - a.score || a.ttl - b.ttl);
  return { topKIds: scored.slice(0, TOP_K).map((s) => s.id) };
}

export function rankContactsForBackground(
  items: Contact[]
): { topKIds: string[] } {
  const corpus = backgroundCorpus();
  const scored = items
    .map((c) => ({
      id: c.id,
      score: overlap(corpus, `${c.name} ${c.email ?? ""}`),
    }))
    .sort((a, b) => b.score - a.score);
  return { topKIds: scored.slice(0, TOP_K).map((s) => s.id) };
}
