/**
 * Proactive pending notifications (SPEC § Proactive notifications).
 * Per-avatar scoring for new connector items; revision and release heuristics.
 */

import type { AggregatedData } from "../connectors/index";
import type { EmailItem } from "../connectors/types";
import type {
  Avatar,
  ConversationMessage,
  NotificationUrgency,
  PendingNotification,
  SituationContext,
  SituationFocus,
} from "../types";
import { scoreEmailItems, type EmailScoringContext } from "./contextScoring/email";
import { resolveBehaviorTuning } from "./behaviorTuningFormat";

/** Max avatars that may speak in one batch when released (SPEC) */
export const PROACTIVE_MAX_AVATARS_PER_CLUSTER = 3;

/** Max new emails to evaluate per proactive pass (avoid floods on first load) */
export const MAX_NEW_EMAILS_PER_EVAL = 3;

/** Max pending rows kept in context */
export const MAX_PENDING_NOTIFICATIONS = 24;

/**
 * Minimum combined score (email relevance base + tag/interest bonus) to consider
 * an avatar for proactive pending. Aligns with medium urgency floor.
 */
export const PROACTIVE_MIN_COMBINED_SCORE = 45;

/**
 * When the email is not focused, only the top scorer is kept unless additional
 * avatars have at least this tag/interest overlap with the email (avoids N
 * identical “base only” notifiers).
 */
export const PROACTIVE_MIN_AFFINITY_BONUS = 5;

const MEDIUM_THRESHOLD = 45;
const PROCESSED_ID_CAP = 200;

function tokenizeForMatch(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((w) => w.length >= 4)
  );
}

/** Stable fingerprint for connector snapshot (not cryptographic) */
export function buildConnectorSnapshotKey(data: AggregatedData): string {
  const e = [...data.email].map((x) => x.id).sort().join(",");
  const c = [...data.calendar].map((x) => x.id).sort().join(",");
  const p = [...data.contacts].map((x) => x.id).sort().join(",");
  return `e:${e}|c:${c}|p:${p}`;
}

function tagInterestBonus(avatar: Avatar, email: EmailItem): number {
  const blob = `${email.subject} ${email.snippet}`.toLowerCase();
  let n = 0;
  for (const t of avatar.tags) {
    if (blob.includes(t.toLowerCase())) n += 6;
  }
  for (const i of avatar.interests) {
    if (blob.includes(i.toLowerCase())) n += 5;
  }
  return Math.min(40, n);
}

function urgencyForScore(
  focusMatch: boolean,
  combined: number
): NotificationUrgency {
  if (focusMatch) return "high";
  if (combined >= MEDIUM_THRESHOLD + 20) return "high";
  if (combined >= MEDIUM_THRESHOLD) return "medium";
  return "low";
}

export type ScoredAvatarOffer = {
  avatarId: string;
  score: number;
  urgency: NotificationUrgency;
  /** Uncapped tag/interest overlap with this email (0–40); used for multi-avatar gating */
  affinityBonus: number;
};

/**
 * After sorting offers by `score` descending, keep at most PROACTIVE_MAX_AVATARS_PER_CLUSTER
 * with a minimum score. When the user has not focused this email, only the first slot is
 * “free”; further slots require avatar-specific affinity (tag/interest hit on the email).
 */
export type ProactiveThresholds = {
  minCombined: number;
  minAffinity: number;
};

export function filterProactiveAvatarOffers(
  sortedDescending: ScoredAvatarOffer[],
  focusMatchEmail: boolean,
  thresholds?: ProactiveThresholds
): ScoredAvatarOffer[] {
  const minCombined = thresholds?.minCombined ?? PROACTIVE_MIN_COMBINED_SCORE;
  const minAffinity = thresholds?.minAffinity ?? PROACTIVE_MIN_AFFINITY_BONUS;
  const aboveFloor = sortedDescending.filter((o) => o.score >= minCombined);
  if (aboveFloor.length === 0) return [];

  const kept: ScoredAvatarOffer[] = [];
  for (const o of aboveFloor) {
    if (kept.length >= PROACTIVE_MAX_AVATARS_PER_CLUSTER) break;
    if (kept.length === 0) {
      kept.push(o);
      continue;
    }
    if (focusMatchEmail || o.affinityBonus >= minAffinity) {
      kept.push(o);
    }
  }
  return kept;
}

/**
 * Per-avatar scores for one email; filtered and capped, score-sorted.
 */
export function scoreAvatarsForNewEmail(
  email: EmailItem,
  ctx: SituationContext,
  avatars: Avatar[],
  focus?: SituationFocus
): ScoredAvatarOffer[] {
  const esc: EmailScoringContext = {
    conversationThread: ctx.conversationThread,
    activeTask: ctx.activeTask,
    focus,
  };
  const base = scoreEmailItems([email], esc)[0]?.score ?? 0;
  const focusMatch = Boolean(focus?.email?.id && focus.email.id === email.id);

  const scored = avatars.map((avatar) => {
    const bonus = tagInterestBonus(avatar, email);
    const combined = base + bonus;
    return {
      avatarId: avatar.id,
      score: combined,
      urgency: urgencyForScore(focusMatch, combined),
      affinityBonus: bonus,
    };
  });
  scored.sort((a, b) => b.score - a.score || a.avatarId.localeCompare(b.avatarId));
  const tuning = resolveBehaviorTuning(ctx);
  return filterProactiveAvatarOffers(scored, focusMatch, {
    minCombined: tuning.proactiveMinCombinedScore,
    minAffinity: tuning.proactiveMinAffinityBonus,
  });
}

/** Remove pending rows superseded by conversation (addressed topics) */
export function revisePendingForThread(
  pending: PendingNotification[],
  thread: ConversationMessage[]
): PendingNotification[] {
  const userText = thread
    .filter((m) => m.role === "user")
    .map((m) => m.content.toLowerCase())
    .join(" \n ");
  if (!userText.trim()) return pending;

  return pending.filter((p) => {
    const topicWords = tokenizeForMatch(p.topicSummary);
    let hits = 0;
    for (const w of topicWords) {
      if (userText.includes(w)) hits++;
    }
    return hits < 2;
  });
}

/**
 * User message counts as release if it shares enough tokens with a pending topic line.
 */
export function computeReleasedClusterIds(
  userText: string,
  pending: PendingNotification[]
): string[] {
  const words = tokenizeForMatch(userText);
  if (words.size === 0) return [];
  const released = new Set<string>();
  for (const p of pending) {
    const topicWords = tokenizeForMatch(p.topicSummary);
    let hits = 0;
    for (const w of topicWords) {
      if (words.has(w) || userText.toLowerCase().includes(w)) hits++;
    }
    if (hits >= 2) released.add(p.topicClusterId);
  }
  return [...released];
}

/** Union of token-based release and explicit cluster ids from UI (e.g. Discuss). */
export function mergeReleasedClusterIds(
  userText: string,
  pending: PendingNotification[],
  explicit?: string[]
): string[] {
  const fromText = computeReleasedClusterIds(userText, pending);
  return [...new Set([...fromText, ...(explicit ?? [])])];
}

/** Drop all pending rows for the given topic cluster ids (after a released turn). */
export function removePendingByClusterIds(
  pending: PendingNotification[],
  clusterIds: string[]
): PendingNotification[] {
  if (clusterIds.length === 0) return pending;
  const drop = new Set(clusterIds);
  return pending.filter((p) => !drop.has(p.topicClusterId));
}

function capPending(list: PendingNotification[]): PendingNotification[] {
  const sorted = [...list].sort((a, b) => b.createdAt - a.createdAt);
  return sorted.slice(0, MAX_PENDING_NOTIFICATIONS);
}

/**
 * Merge externally-produced notifications (e.g. platform scheduler fires) into
 * a `SituationContext`. De-dupes by id; caps to `MAX_PENDING_NOTIFICATIONS`.
 * Preserves all existing pending entries so routine proactive eval is
 * unaffected.
 */
export function addPendingNotifications(
  ctx: SituationContext,
  additions: PendingNotification[]
): SituationContext {
  if (additions.length === 0) return ctx;
  const existing = ctx.pendingNotifications ?? [];
  const seen = new Set(existing.map((n) => n.id));
  const merged: PendingNotification[] = [...existing];
  for (const n of additions) {
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    merged.push(n);
  }
  return {
    ...ctx,
    pendingNotifications: capPending(merged),
  };
}

export function mergeProactiveEvaluation(
  data: AggregatedData,
  ctx: SituationContext,
  avatars: Avatar[],
  focus?: SituationFocus
): SituationContext {
  const processed = new Set(ctx.proactiveProcessedEmailIds ?? []);
  let pending = revisePendingForThread(ctx.pendingNotifications ?? [], ctx.conversationThread);

  const unseen = [...data.email]
    .filter((e) => !processed.has(e.id))
    .sort((a, b) => b.date - a.date)
    .slice(0, MAX_NEW_EMAILS_PER_EVAL);

  for (const email of unseen) {
    processed.add(email.id);
    const offers = scoreAvatarsForNewEmail(email, ctx, avatars, focus);
    const clusterId = `email:${email.id}`;
    const topicSummary = `${email.subject || "(no subject)"} — ${email.snippet.slice(0, 80)}`;

    for (const o of offers) {
      if (o.urgency === "low") continue;
      pending.push({
        id: crypto.randomUUID(),
        avatarId: o.avatarId,
        urgency: o.urgency,
        topicSummary,
        sourceRef: { kind: "email", id: email.id },
        score: o.score,
        createdAt: Date.now(),
        topicClusterId: clusterId,
      });
    }
  }

  const ids = [...processed];
  const trimmedProcessed =
    ids.length > PROCESSED_ID_CAP ? ids.slice(-PROCESSED_ID_CAP) : ids;

  return {
    ...ctx,
    pendingNotifications: capPending(pending),
    proactiveProcessedEmailIds: trimmedProcessed,
    lastConnectorSnapshotKey: buildConnectorSnapshotKey(data),
  };
}

export function formatPendingNotificationsForPrompt(
  pending: PendingNotification[] | undefined,
  releasedClusterIds: string[] | undefined
): string {
  if (!pending?.length) return "";
  const released = new Set(releasedClusterIds ?? []);
  const lines = pending.map((p) => {
    const rel = released.has(p.topicClusterId) ? "released" : "held";
    return `- [${p.urgency}] ${p.avatarId}: ${p.topicSummary} (${rel}; cluster ${p.topicClusterId})`;
  });
  return `Pending notifications (incorporate if relevant to the user’s message; otherwise keep as separate held topics — do not force unrelated merges):\n${lines.join("\n")}`;
}
