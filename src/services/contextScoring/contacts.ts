/**
 * Contact context scoring — rank contacts vs Situation Context for prompt relevance (SPEC § Context scoring agents).
 */

import type { Contact } from "../../connectors/types";
import type { ConversationMessage, SituationFocus } from "../../types";

/** Max contact lines injected into `relevantData` per turn */
export const CONTACT_CONTEXT_TOP_K = 5;

/** How many tail messages contribute to the keyword corpus */
export const CONTACT_THREAD_TAIL_DEFAULT = 15;

const FOCUS_ID_MATCH_BONUS = 10_000;
const MAX_OVERLAP_POINTS = 80;
const POINTS_PER_KEYWORD_HIT = 4;

export type ContactScoringContext = {
  focus?: SituationFocus;
  conversationThread: ConversationMessage[];
  activeTask?: string;
  threadTailSize?: number;
  /**
   * Extra text per contact id (e.g. tags, notes from world metadata) folded into the overlap blob.
   */
  contactOverlayById?: Record<string, string>;
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
 * Sort by score (then name), take top K, format for `relevantData`.
 * Score shown 0–100 is normalized against the max score in this batch.
 */
export function scoreAndFormatContacts(
  contacts: Contact[],
  ctx: ContactScoringContext,
  topK: number = CONTACT_CONTEXT_TOP_K
): string[] {
  if (contacts.length === 0) return [];
  const scored = scoreContactItems(contacts, ctx);
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.contact.name.localeCompare(b.contact.name, undefined, {
      sensitivity: "base",
    });
  });
  const maxScore = Math.max(...scored.map((s) => s.score), 1);
  return scored.slice(0, topK).map(({ contact, score }, i) => {
    const rank = i + 1;
    const norm = Math.round((100 * score) / maxScore);
    const name = contact.name.trim() || "(no name)";
    const email = contact.email?.trim();
    const emailPart = email ? ` — ${email}` : "";
    const bday = contact.birthday?.trim();
    const bdayPart = bday ? ` (birthday: ${bday})` : "";
    return `contact [rank ${rank}, score ${norm}]: ${name}${emailPart}${bdayPart}`;
  });
}
