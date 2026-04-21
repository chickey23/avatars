import type { Avatar, SituationContext } from "../../types";
import {
  DEFAULT_ROSTER_SCORE,
  LEGACY_POPULARITY_STORAGE_KEY,
  MAX_ROSTER_SCORE,
  MIN_ROSTER_SCORE,
} from "./constants";

export function coldResetLegacyPopularityStorage(): void {
  try {
    localStorage.removeItem(LEGACY_POPULARITY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function getRosterScore(
  scores: Record<string, number> | undefined,
  avatarId: string
): number {
  const v = scores?.[avatarId];
  if (typeof v !== "number" || Number.isNaN(v)) return DEFAULT_ROSTER_SCORE;
  return Math.min(MAX_ROSTER_SCORE, Math.max(MIN_ROSTER_SCORE, Math.round(v)));
}

/** Map 0–100 roster score into routing bias roughly like legacy popularity. */
export function getRoutingBiasFromRosterScore(score: number): number {
  const s = Math.min(MAX_ROSTER_SCORE, Math.max(MIN_ROSTER_SCORE, score));
  const centered = s - DEFAULT_ROSTER_SCORE;
  const bias = Math.round((centered / (MAX_ROSTER_SCORE - DEFAULT_ROSTER_SCORE || 1)) * 22);
  return Math.max(-22, Math.min(22, bias));
}

export function getSemanticBiasFromRosterScore(score: number): number {
  return getRoutingBiasFromRosterScore(score) * 0.018;
}

/**
 * If `next` for `avatarId` would exceed MAX, subtract 1 from every other avatar with score >= 1, then cap recipient.
 */
export function applyScoreDeltaWithCap(
  scores: Record<string, number>,
  avatarId: string,
  delta: number,
  allCatalogIds: string[]
): Record<string, number> {
  if (delta === 0) return { ...scores };
  const out: Record<string, number> = { ...scores };
  const cur = getRosterScore(out, avatarId);
  if (delta < 0) {
    out[avatarId] = Math.max(MIN_ROSTER_SCORE, cur + delta);
    return normalizeScores(out, allCatalogIds);
  }
  let next = cur + delta;
  if (next <= MAX_ROSTER_SCORE) {
    out[avatarId] = Math.min(MAX_ROSTER_SCORE, next);
    return normalizeScores(out, allCatalogIds);
  }
  for (const id of allCatalogIds) {
    if (id === avatarId) continue;
    const v = getRosterScore(out, id);
    if (v >= 1) {
      out[id] = v - 1;
    }
  }
  next = getRosterScore(out, avatarId) + delta;
  out[avatarId] = Math.min(MAX_ROSTER_SCORE, Math.max(MIN_ROSTER_SCORE, next));
  return normalizeScores(out, allCatalogIds);
}

function normalizeScores(
  scores: Record<string, number>,
  allCatalogIds: string[]
): Record<string, number> {
  const out = { ...scores };
  for (const id of allCatalogIds) {
    const v = out[id];
    if (typeof v === "number" && !Number.isNaN(v)) {
      out[id] = Math.min(MAX_ROSTER_SCORE, Math.max(MIN_ROSTER_SCORE, Math.round(v)));
    }
  }
  return out;
}

export function applyUnhelpfulDecrement(
  scores: Record<string, number>,
  avatarId: string,
  allCatalogIds: string[]
): Record<string, number> {
  const out = { ...scores };
  const cur = getRosterScore(out, avatarId);
  out[avatarId] = Math.max(MIN_ROSTER_SCORE, cur - 1);
  return normalizeScores(out, allCatalogIds);
}

/**
 * After drag-reorder of core avatars (top = highest priority), assign descending scores 100.. within core.
 */
export function scoresFromCoreOrder(
  prev: Record<string, number> | undefined,
  coreOrderedIds: string[],
  allCatalogIds: string[]
): Record<string, number> {
  const out: Record<string, number> = { ...prev };
  const n = coreOrderedIds.length;
  for (let i = 0; i < n; i++) {
    const id = coreOrderedIds[i]!;
    const s = Math.max(1, MAX_ROSTER_SCORE - i);
    out[id] = Math.min(MAX_ROSTER_SCORE, s);
  }
  return normalizeScores(out, allCatalogIds);
}

export function initRosterScoresIfNeeded(ctx: SituationContext, catalog: Avatar[]): SituationContext {
  if (ctx.avatarRosterScoresInitialized) return ctx;
  coldResetLegacyPopularityStorage();
  const ids = catalog.map((a) => a.id);
  const nextScores: Record<string, number> = {
    ...(ctx.avatarRosterPriorityScoreById ?? {}),
  };
  for (const id of ids) {
    if (nextScores[id] === undefined) {
      nextScores[id] = DEFAULT_ROSTER_SCORE;
    }
  }
  return {
    ...ctx,
    avatarRosterPriorityScoreById: nextScores,
    avatarRosterScoresInitialized: true,
  };
}
