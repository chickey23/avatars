/**
 * Email context scoring — rank recent messages vs Situation Context for prompt relevance (SPEC § Context scoring agents, email first).
 */

import type { EmailItem } from "../../connectors/types";
import type {
  ConversationMessage,
  EmailRankingDiagnosticRow,
  EmailRankingDiagnostics,
  SituationFocus,
} from "../../types";
import {
  FOCUS_ID_MATCH_BONUS,
  softBonusForEmail,
  type FocusSoftSignals,
} from "./focusRelevance";
import { computeNormFocusDisplays } from "./normFocus";

export { FOCUS_ID_MATCH_BONUS } from "./focusRelevance";

/** Max email lines injected into `relevantData` per turn */
export const EMAIL_CONTEXT_TOP_K = 5;

/** normFocus at or above this triggers optional body prefetch (non-focused). */
export const EMAIL_STRONG_MATCH_MIN_NORM = 82;

/** Max additional full bodies prefetched beyond the focused message. */
export const EMAIL_BODY_PREFETCH_MAX_EXTRA = 2;

/** How many tail messages contribute to the keyword corpus */
export const EMAIL_THREAD_TAIL_DEFAULT = 15;

const MAX_OVERLAP_POINTS = 80;
const POINTS_PER_KEYWORD_HIT = 4;

export type EmailScoringContext = {
  focus?: SituationFocus;
  conversationThread: ConversationMessage[];
  activeTask?: string;
  threadTailSize?: number;
  /** Lowercase text from focused email/calendar (subject, snippet, body excerpt). */
  focusCorpusAppendix?: string;
  /** Capped world-metadata snippets (user profile, people, focused project). */
  worldMetadataCorpus?: string;
  /** Shared venue / date-window signals for soft bonuses. */
  focusSoft?: FocusSoftSignals;
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

export function scoreEmailItems(
  emails: EmailItem[],
  ctx: EmailScoringContext
): Array<{ email: EmailItem; score: number }> {
  const corpus = buildCorpus(ctx);
  const focusEmailId = ctx.focus?.email?.id;
  const sig = ctx.focusSoft;

  return emails.map((email) => {
    let score = 0;
    if (focusEmailId && email.id === focusEmailId) {
      score += FOCUS_ID_MATCH_BONUS;
    }
    const blob = `${email.from} ${email.subject} ${email.snippet}`;
    score += overlapScore(corpus, blob);
    score += softBonusForEmail(email, blob.toLowerCase(), sig);
    return { email, score };
  });
}

export type RankedEmailForContext = {
  email: EmailItem;
  rawScore: number;
  /** Normalized vs max raw in batch (legacy / diagnostics). */
  normScore: number;
  /** Focus-relative 0–100 for prompts and strong-match threshold. */
  normFocus: number;
  rank: number;
};

/**
 * Top-K emails by score with normalized rank scores (same ordering as formatted lines).
 */
export function rankEmailsForContext(
  emails: EmailItem[],
  ctx: EmailScoringContext,
  topK: number = EMAIL_CONTEXT_TOP_K
): RankedEmailForContext[] {
  if (emails.length === 0) return [];
  const scored = scoreEmailItems(emails, ctx);
  scored.sort((a, b) => b.score - a.score || b.email.date - a.email.date);
  const slice = scored.slice(0, topK);
  const focusEmailId = ctx.focus?.email?.id;
  const rawScores = slice.map((s) => s.score);
  const focusFlags = slice.map(
    (s) => Boolean(focusEmailId && s.email.id === focusEmailId)
  );
  const normFocusList = computeNormFocusDisplays(rawScores, focusFlags);
  const maxScore = Math.max(...rawScores, 1);
  return slice.map((s, i) => ({
    email: s.email,
    rawScore: s.score,
    normScore: Math.round((100 * s.score) / maxScore),
    normFocus: normFocusList[i]!,
    rank: i + 1,
  }));
}

export type EmailBelowTopKRow = {
  email: EmailItem;
  rawScore: number;
  normFocus: number;
  normScore: number;
  rank: number;
};

/**
 * Top-K rows match `rankEmailsForContext` (same normFocus as prompt lines).
 * `belowTopK` uses focus-relative scores over the **full** fetched batch so the UI
 * can show messages that were scored but not injected into `relevantData`.
 */
export function rankEmailsForContextWithDiagnostics(
  emails: EmailItem[],
  ctx: EmailScoringContext,
  topK: number = EMAIL_CONTEXT_TOP_K
): { inPrompt: RankedEmailForContext[]; belowTopK: EmailBelowTopKRow[] } {
  const inPrompt = rankEmailsForContext(emails, ctx, topK);
  if (emails.length <= topK) {
    return { inPrompt, belowTopK: [] };
  }
  const scored = scoreEmailItems(emails, ctx);
  scored.sort((a, b) => b.score - a.score || b.email.date - a.email.date);
  const focusEmailId = ctx.focus?.email?.id;
  const fullRaw = scored.map((s) => s.score);
  const fullFlags = scored.map((s) =>
    Boolean(focusEmailId && s.email.id === focusEmailId)
  );
  const fullNorm = computeNormFocusDisplays(fullRaw, fullFlags);
  const topSlice = scored.slice(0, topK);
  const maxInTopK = Math.max(...topSlice.map((s) => s.score), 1);
  const belowTopK: EmailBelowTopKRow[] = scored.slice(topK).map((s, i) => {
    const idx = topK + i;
    return {
      email: s.email,
      rawScore: s.score,
      normFocus: fullNorm[idx]!,
      normScore: Math.round((100 * s.score) / maxInTopK),
      rank: idx + 1,
    };
  });
  return { inPrompt, belowTopK };
}

function diagnosticRowFromRanked(r: RankedEmailForContext): EmailRankingDiagnosticRow {
  const subj = r.email.subject.trim() || "(no subject)";
  const snip = r.email.snippet.replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    emailId: r.email.id,
    subject: subj,
    from: r.email.from,
    snippet: snip,
    rawScore: r.rawScore,
    normFocus: r.normFocus,
    normScore: r.normScore,
    rank: r.rank,
  };
}

function diagnosticRowFromBelow(r: EmailBelowTopKRow): EmailRankingDiagnosticRow {
  const subj = r.email.subject.trim() || "(no subject)";
  const snip = r.email.snippet.replace(/\s+/g, " ").trim().slice(0, 120);
  return {
    emailId: r.email.id,
    subject: subj,
    from: r.email.from,
    snippet: snip,
    rawScore: r.rawScore,
    normFocus: r.normFocus,
    normScore: r.normScore,
    rank: r.rank,
  };
}

export function buildEmailRankingDiagnostics(
  emails: EmailItem[],
  ctx: EmailScoringContext,
  topK: number = EMAIL_CONTEXT_TOP_K
): EmailRankingDiagnostics {
  const { inPrompt, belowTopK } = rankEmailsForContextWithDiagnostics(
    emails,
    ctx,
    topK
  );
  return {
    topK,
    inPrompt: inPrompt.map(diagnosticRowFromRanked),
    belowTopK: belowTopK.map(diagnosticRowFromBelow),
  };
}

/** Single scoring pass: lines for `relevantData`, ranked rows for prefetch, diagnostics for UI. */
export function rankEmailsLinesAndDiagnostics(
  emails: EmailItem[],
  ctx: EmailScoringContext,
  topK: number = EMAIL_CONTEXT_TOP_K
): {
  emailLines: string[];
  ranked: RankedEmailForContext[];
  diagnostics: EmailRankingDiagnostics;
} {
  const split = rankEmailsForContextWithDiagnostics(emails, ctx, topK);
  const emailLines = split.inPrompt.map(formatRankedEmailLine);
  return {
    emailLines,
    ranked: split.inPrompt,
    diagnostics: {
      topK,
      inPrompt: split.inPrompt.map(diagnosticRowFromRanked),
      belowTopK: split.belowTopK.map(diagnosticRowFromBelow),
    },
  };
}

export function formatRankedEmailLine(r: RankedEmailForContext): string {
  const { email, normFocus, rank } = r;
  const subj = email.subject.trim() || "(no subject)";
  const snip = email.snippet.replace(/\s+/g, " ").trim().slice(0, 120);
  return `email [id ${email.id}, rank ${rank}, score ${normFocus}]: ${subj} — ${snip} (from ${email.from})`;
}

/**
 * Ids of strongly matching emails in the top-K list (excluding focus) to prefetch full body.
 */
export function selectStrongMatchBodyPrefetchIds(
  ranked: RankedEmailForContext[],
  focusEmailId?: string
): string[] {
  const out: string[] = [];
  for (const r of ranked) {
    if (out.length >= EMAIL_BODY_PREFETCH_MAX_EXTRA) break;
    if (focusEmailId && r.email.id === focusEmailId) continue;
    if (r.normFocus < EMAIL_STRONG_MATCH_MIN_NORM) continue;
    out.push(r.email.id);
  }
  return out;
}

/**
 * Sort by score (then newer `date`), take top K, format for `relevantData`.
 * `score` in each line is focus-relative (see CONTEXT_SCORING.md).
 */
export function scoreAndFormatEmails(
  emails: EmailItem[],
  ctx: EmailScoringContext,
  topK: number = EMAIL_CONTEXT_TOP_K
): string[] {
  return rankEmailsForContext(emails, ctx, topK).map(formatRankedEmailLine);
}
