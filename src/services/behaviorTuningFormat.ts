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
  t: ResolvedBehaviorTuning,
  isExecutor?: boolean
): string {
  const exec =
    isExecutor === true
      ? " You are the routing **executor** for this wave: when the user asks to add a **new** tracked project, you must carry that out with the structured tools (new project id + required title) in this reply when appropriate."
      : "";
  if (t.replyContextFocus >= 65) {
    return `Respond briefly as ${givenName}, grounded in the context above and the user's message; stay in character without burying the substance. If the user shares facts worth saving (projects, people, preferences), use the structured tools JSON block from the guidelines when appropriate.${exec}`;
  }
  if (t.replyContextFocus <= 35) {
    return `Respond briefly as ${givenName}, staying vividly in character; let personality lead while still acknowledging the user's words.${exec}`;
  }
  return `Respond briefly as ${givenName}, staying in character while addressing what the user actually asked.${exec}`;
}

export type RulesTuningFormatOpts = {
  focusSummary?: string;
  relevantData?: string[];
};

/**
 * Prefix for template / rules / fallback replies when Ollama is not used or generation fails.
 *
 * **Intentionally empty:** we used to inject mood, engagement, and the first `relevantData` line
 * (focus/email ids, connector snippets) into chat — that leaked internal context into the visible thread.
 * Full tuning still applies on the **Ollama** path via `formatBehaviorTuningForOllama`.
 */
export function formatBehaviorTuningRulesPrefix(
  _t: ResolvedBehaviorTuning,
  _opts: RulesTuningFormatOpts
): string {
  return "";
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
