/**
 * Contact context scoring — rank contacts vs Situation Context for prompt relevance (SPEC § Context scoring agents).
 */

import type { Contact } from "../../connectors/types";
import type { ConversationMessage, SituationFocus } from "../../types";
import { FOCUS_ID_MATCH_BONUS } from "./focusRelevance";
import { computeNormFocusDisplays } from "./normFocus";

export { FOCUS_ID_MATCH_BONUS } from "./focusRelevance";

/** Max contact lines injected into `relevantData` per turn */
export const CONTACT_CONTEXT_TOP_K = 5;

/** How many tail messages contribute to the keyword corpus */
export const CONTACT_THREAD_TAIL_DEFAULT = 15;

const MAX_OVERLAP_POINTS = 80;
const POINTS_PER_KEYWORD_HIT = 4;

/** Injected when no contact matches thread/focus overlap and there is no focused contact. */
export const SOCIAL_SOLO_HEURISTIC_LINE =
  "Social context (heuristic): No contacts strongly match the current thread or focus; interaction may be solo or unstated—infer carefully and prefer asking before assuming companions.";

export type ContactScoringContext = {
  focus?: SituationFocus;
  conversationThread: ConversationMessage[];
  activeTask?: string;
  threadTailSize?: number;
  /**
   * Extra text per contact id (e.g. tags, notes from world metadata) folded into the overlap blob.
   */
  contactOverlayById?: Record<string, string>;
  focusCorpusAppendix?: string;
  worldMetadataCorpus?: string;
};

function tokenize(s: string, minLen = 3): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9@.+_-]+/i)
    .filter((w) => w.length >= minLen);
}

function buildCorpus(ctx: ContactScoringContext): string {
  const n = ctx.threadTailSize ?? CONTACT_THREAD_TAIL_DEFAULT;
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

function overlapScore(corpus: string, text: string): number {
  const words = new Set(tokenize(text));
  let hits = 0;
  for (const w of words) {
    if (corpus.includes(w)) hits++;
  }
  return Math.min(MAX_OVERLAP_POINTS, hits * POINTS_PER_KEYWORD_HIT);
}

function contactBlob(
  contact: Contact,
  overlayById?: Record<string, string>
): string {
  const bits = [
    contact.name,
    contact.email ?? "",
    contact.birthday ?? "",
    overlayById?.[contact.id]?.trim() ?? "",
  ];
  return bits.filter(Boolean).join(" ");
}

export function scoreContactItems(
  contacts: Contact[],
  ctx: ContactScoringContext
): Array<{ contact: Contact; score: number }> {
  const corpus = buildCorpus(ctx);
  const focusContactId = ctx.focus?.contact?.id;
  const overlay = ctx.contactOverlayById;

  return contacts.map((contact) => {
    let score = 0;
    if (focusContactId && contact.id === focusContactId) {
      score += FOCUS_ID_MATCH_BONUS;
    }
    const blob = contactBlob(contact, overlay);
    score += overlapScore(corpus, blob);
    return { contact, score };
  });
}

/**
 * True when top-K contacts after sorting are all at score 0 (no thread/focus/metadata overlap)
 * and the user did not focus a specific contact.
 */
export function shouldInjectSocialSoloHint(
  contacts: Contact[],
  ctx: ContactScoringContext,
  topK: number = CONTACT_CONTEXT_TOP_K
): boolean {
  if (ctx.focus?.contact?.id) return false;
  if (contacts.length === 0) return false;
  const scored = scoreContactItems(contacts, ctx);
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.contact.name.localeCompare(b.contact.name, undefined, {
      sensitivity: "base",
    });
  });
  const top = scored.slice(0, topK);
  return top.length > 0 && top.every((s) => s.score === 0);
}

export type RankedContactForContext = {
  contact: Contact;
  rawScore: number;
  normScore: number;
  normFocus: number;
  rank: number;
};

export function rankContactsForContext(
  contacts: Contact[],
  ctx: ContactScoringContext,
  topK: number = CONTACT_CONTEXT_TOP_K
): RankedContactForContext[] {
  if (contacts.length === 0) return [];
  const scored = scoreContactItems(contacts, ctx);
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.contact.name.localeCompare(b.contact.name, undefined, {
      sensitivity: "base",
    });
  });
  const slice = scored.slice(0, topK);
  const focusContactId = ctx.focus?.contact?.id;
  const rawScores = slice.map((s) => s.score);
  const focusFlags = slice.map(
    (s) => Boolean(focusContactId && s.contact.id === focusContactId)
  );
  const normFocusList = computeNormFocusDisplays(rawScores, focusFlags);
  const maxScore = Math.max(...rawScores, 1);
  return slice.map((s, i) => ({
    contact: s.contact,
    rawScore: s.score,
    normScore: Math.round((100 * s.score) / maxScore),
    normFocus: normFocusList[i]!,
    rank: i + 1,
  }));
}

function formatRankedContactLine(r: RankedContactForContext): string {
  const { contact, normFocus, rank } = r;
  const name = contact.name.trim() || "(no name)";
  const email = contact.email?.trim();
  const emailPart = email ? ` — ${email}` : "";
  const bday = contact.birthday?.trim();
  const bdayPart = bday ? ` (birthday: ${bday})` : "";
  return `contact [rank ${rank}, score ${normFocus}]: ${name}${emailPart}${bdayPart}`;
}

/**
 * Sort by score (then name), take top K, format for `relevantData`.
 * `score` in each line is focus-relative.
 */
export function scoreAndFormatContacts(
  contacts: Contact[],
  ctx: ContactScoringContext,
  topK: number = CONTACT_CONTEXT_TOP_K
): string[] {
  return rankContactsForContext(contacts, ctx, topK).map(formatRankedContactLine);
}
