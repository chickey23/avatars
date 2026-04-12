/**
 * Primary avatar roster: how many of the ordered catalog appear as “primary” in the sidebar
 * and in switchboard routing (Phase A).
 */

import type { Avatar, SituationContext } from "../types";

/** Upper bound for the primary slot count picker (SPEC / UX cap). */
export const MAX_PRIMARY_SLOTS = 9;

/**
 * Effective number of primary slots: requested count clamped to catalog size and MAX_PRIMARY_SLOTS.
 * Default requested value when unset: 3.
 */
export function resolvePrimarySlotCount(
  ctx: SituationContext,
  catalogLength: number
): number {
  if (catalogLength <= 0) return 0;
  const requested = ctx.primaryAvatarSlotCount ?? 3;
  const cap = Math.min(MAX_PRIMARY_SLOTS, catalogLength);
  return Math.min(Math.max(1, requested), cap);
}

/** First `slotCount` avatars from the ordered catalog (primaries for this session). */
export function getActivePrimaryAvatars(
  catalog: Avatar[],
  slotCount: number
): Avatar[] {
  if (slotCount <= 0) return [];
  return catalog.slice(0, slotCount);
}

/**
 * Primary roster: catalog order among selected avatars, then remaining catalog entries,
 * then take the first `slotCount`. Empty `selectedIds` yields the same as {@link getActivePrimaryAvatars}.
 */
export function getActivePrimaryAvatarsPreferringSelected(
  catalog: Avatar[],
  slotCount: number,
  selectedIds: string[]
): Avatar[] {
  if (slotCount <= 0) return [];
  if (selectedIds.length === 0) {
    return getActivePrimaryAvatars(catalog, slotCount);
  }
  const selectedSet = new Set(selectedIds);
  const selectedInCatalogOrder = catalog.filter((a) => selectedSet.has(a.id));
  const unselected = catalog.filter((a) => !selectedSet.has(a.id));
  return [...selectedInCatalogOrder, ...unselected].slice(0, slotCount);
}
