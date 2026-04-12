/**
 * Resolve and format user behavior tuning for Ollama prompts and rules/fallback replies.
 */

import type { SituationContext } from "../types";

export const DEFAULT_PROACTIVE_MIN_COMBINED_SCORE = 45;
export const DEFAULT_PROACTIVE_MIN_AFFINITY_BONUS = 5;
export const DEFAULT_REPLY_CONTEXT_FOCUS = 50;
export const DEFAULT_USER_ENGAGEMENT_LEVEL = 70;

export type ResolvedBehaviorTuning = {
  proactiveMinCombinedScore: number;
  proactiveMinAffinityBonus: number;
  replyContextFocus: number;
  userEngagementLevel: number;
  userMoodNote: string;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function resolveBehaviorTuning(
  ctx: Pick<SituationContext, "behaviorTuning">
): ResolvedBehaviorTuning {
  const b = ctx.behaviorTuning ?? {};
  return {
    proactiveMinCombinedScore: clamp(
      b.proactiveMinCombinedScore ?? DEFAULT_PROACTIVE_MIN_COMBINED_SCORE,
      20,
      95
    ),
    proactiveMinAffinityBonus: clamp(
      b.proactiveMinAffinityBonus ?? DEFAULT_PROACTIVE_MIN_AFFINITY_BONUS,
      0,
      40
    ),
    replyContextFocus: clamp(
      b.replyContextFocus ?? DEFAULT_REPLY_CONTEXT_FOCUS,
      0,
      100
    ),
    userEngagementLevel: clamp(
      b.userEngagementLevel ?? DEFAULT_USER_ENGAGEMENT_LEVEL,
      0,
      100
    ),
    userMoodNote: (b.userMoodNote ?? "").trim().slice(0, 500),
  };
}

/** Paragraph(s) appended inside the Ollama prompt before the closing instruction. */
export function formatBehaviorTuningForOllama(t: ResolvedBehaviorTuning): string {
  const lines: string[] = [];

  if (t.userMoodNote) {
    lines.push(`User mood (honor this): ${t.userMoodNote}`);
  }

  if (t.userEngagementLevel < 40) {
    lines.push(
      "Engagement: user prefers very short, low-energy replies—one or two sentences, direct."
    );
  } else if (t.userEngagementLevel > 75) {
    lines.push(
      "Engagement: user is open to fuller replies; you may elaborate slightly if it serves the answer."
    );
  } else {
    lines.push(
      "Engagement: balanced length—brief by default, a bit more detail when the context calls for it."
    );
  }

  if (t.replyContextFocus >= 65) {
    lines.push(
      "Style: prioritize the supplied relevant context, Focus lines, and the user's literal message over theatrical persona flourishes."
    );
  } else if (t.replyContextFocus <= 35) {
    lines.push(
      "Style: lean into character and voice; treat connector context as supporting material, not the main show."
    );
  } else {
    lines.push(
      "Style: balance grounded answers (using context when relevant) with staying in character."
    );
  }

  return `Present state (apply consistently):\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

export function formatOllamaClosingInstruction(
  givenName: string,
  t: ResolvedBehaviorTuning
): string {
  if (t.replyContextFocus >= 65) {
    return `Respond briefly as ${givenName}, grounded in the context above and the user's message; stay in character without burying the substance.`;
  }
  if (t.replyContextFocus <= 35) {
    return `Respond briefly as ${givenName}, staying vividly in character; let personality lead while still acknowledging the user's words.`;
  }
  return `Respond briefly as ${givenName}, staying in character while addressing what the user actually asked.`;
}

export type RulesTuningFormatOpts = {
  focusSummary?: string;
  relevantData?: string[];
};

/** Leading text for template / fallback replies (same semantics as Ollama block, condensed). */
export function formatBehaviorTuningRulesPrefix(
  t: ResolvedBehaviorTuning,
  opts: RulesTuningFormatOpts
): string {
  const parts: string[] = [];

  if (t.userMoodNote) {
    parts.push(`[User mood: ${t.userMoodNote}]`);
  }

  if (t.userEngagementLevel < 40) {
    parts.push("[Keep it to one short sentence.]");
  } else if (t.userEngagementLevel > 75) {
    parts.push("[You may use a bit more length if helpful.]");
  }

  if (t.replyContextFocus >= 65) {
    const ctxLine = opts.relevantData?.find((s) => s.trim().length > 0);
    const snippet = ctxLine?.replace(/\s+/g, " ").trim().slice(0, 140);
    if (snippet) {
      parts.push(`[Ground in context: ${snippet}]`);
    } else if (opts.focusSummary) {
      parts.push(`[Ground in focus: ${opts.focusSummary}.]`);
    } else {
      parts.push("[Prioritize the user's literal message over flourish.]");
    }
  } else if (t.replyContextFocus <= 35) {
    parts.push("[Voice first; context is secondary.]");
  }

  if (opts.focusSummary && t.replyContextFocus >= 50) {
    parts.push(`[Tracking: ${opts.focusSummary}.]`);
  }

  return parts.length > 0 ? `${parts.join(" ")} ` : "";
}

/** Collapse verbose template output when engagement is low. */
export function compressRulesBodyForEngagement(
  t: ResolvedBehaviorTuning,
  body: string
): string {
  if (t.userEngagementLevel >= 40) return body;
  const t1 = body.trim();
  const cut = t1.search(/[.!?](\s|$)/);
  if (cut === -1) return t1.length > 120 ? `${t1.slice(0, 117)}…` : t1;
  return t1.slice(0, cut + 1).trim();
}
