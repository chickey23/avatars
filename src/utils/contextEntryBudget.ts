/**
 * Maps per-source depth t ∈ [0, 1] to fetch/top-K limits via log spacing
 * from **legacy baselines** at t=0 (fine control at low t, larger values toward t=1).
 */

import type { ContextEntryDepth } from "../types";

export type ContextEntryBudgets = {
  emailFetchLimit: number;
  emailTopK: number;
  calendarDays: number;
  /** Google Calendar API maxResults (list page). */
  calendarMaxResults: number;
  /** Max scored calendar lines in the prompt (≤ fetched events). */
  calendarTopK: number;
  contactsFetchLimit: number;
  contactsTopK: number;
  /** Extra project one-liners beyond focused-project detail (0 at t=0). */
  projectExtraTopK: number;
  /**
   * Max hits requested per targeted search run (Context → Internet tab).
   * Tauri `targeted_search_query` clamps to 20.
   */
  internetSearchMaxResults: number;
};

/** Matches pre-slider behavior when all depth keys are omitted. */
export const LEGACY_CONTEXT_ENTRY_BUDGETS: ContextEntryBudgets = {
  emailFetchLimit: 5,
  emailTopK: 5,
  calendarDays: 30,
  calendarMaxResults: 50,
  calendarTopK: 5,
  contactsFetchLimit: 50,
  contactsTopK: 5,
  projectExtraTopK: 0,
  internetSearchMaxResults: 1,
};

function clamp01(t: number): number {
  if (Number.isNaN(t)) return 0;
  return Math.min(1, Math.max(0, t));
}

/**
 * Log interpolation between legacy (at t=0) and max (at t=1). Legacy must be ≥ 1.
 */
export function growFromLegacy(
  legacy: number,
  max: number,
  t: number
): number {
  const tt = clamp01(t);
  const lo = Math.max(1, legacy);
  const hi = Math.max(lo, max);
  if (hi <= lo) return lo;
  const v = Math.round(
    Math.exp(Math.log(lo) + tt * (Math.log(hi) - Math.log(lo)))
  );
  return Math.min(hi, Math.max(lo, v));
}

export function resolveContextEntryBudgets(
  depth: ContextEntryDepth | undefined
): ContextEntryBudgets {
  const out = { ...LEGACY_CONTEXT_ENTRY_BUDGETS };
  if (!depth) return out;

  if (depth.email !== undefined && !Number.isNaN(depth.email)) {
    const t = clamp01(depth.email);
    out.emailFetchLimit = growFromLegacy(5, 500, t);
    out.emailTopK = Math.min(
      out.emailFetchLimit,
      growFromLegacy(5, 120, t)
    );
  }

  if (depth.calendar !== undefined && !Number.isNaN(depth.calendar)) {
    const t = clamp01(depth.calendar);
    out.calendarDays = growFromLegacy(30, 365, t);
    out.calendarMaxResults = growFromLegacy(50, 250, t);
    out.calendarTopK = Math.min(
      out.calendarMaxResults,
      growFromLegacy(5, 100, t)
    );
  }

  if (depth.contacts !== undefined && !Number.isNaN(depth.contacts)) {
    const t = clamp01(depth.contacts);
    out.contactsFetchLimit = growFromLegacy(50, 100, t);
    out.contactsTopK = Math.min(
      out.contactsFetchLimit,
      growFromLegacy(5, 60, t)
    );
  }

  if (depth.projects !== undefined && !Number.isNaN(depth.projects)) {
    const t = clamp01(depth.projects);
    out.projectExtraTopK = Math.min(20, Math.round(t * 20));
  }

  if (depth.internet !== undefined && !Number.isNaN(depth.internet)) {
    const t = clamp01(depth.internet);
    out.internetSearchMaxResults = Math.min(
      20,
      growFromLegacy(1, 12, t)
    );
  }

  return out;
}
