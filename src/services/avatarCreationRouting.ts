/**
 * Resolves which avatar should execute avatar-creation workshop offers and
 * which catalog snapshot monitor action handlers should consult. Wired from
 * AppProvider alongside the synthetic-post sink.
 */

import type { Avatar } from "../types";
import { findToolOwnerAvatarIds } from "./avatarTags";
import { getRoutingCatalogRef, isSystemAvatarId } from "./platform/routing";

/** Default steward when no avatar claims `tool_owner:avatar_creation`. */
export const AVATAR_CREATION_TOOL_OWNER_FALLBACK_ID = "blessed_exchequer" as const;

let catalogAccessor: (() => readonly Avatar[]) | null = null;

export function setAvatarCatalogAccessor(fn: (() => readonly Avatar[]) | null): void {
  catalogAccessor = fn;
}

export function getAvatarCatalogSnapshot(): readonly Avatar[] {
  const snap = catalogAccessor?.();
  if (snap && snap.length > 0) return snap;
  return getRoutingCatalogRef();
}

/**
 * First sorted holder of `tool_owner:avatar_creation`, else built-in fallback.
 */
export function resolveAvatarCreationToolOwnerId(
  catalog?: readonly Avatar[]
): string {
  const cat = catalog ?? getAvatarCatalogSnapshot();
  const ids = findToolOwnerAvatarIds(cat, "avatar_creation");
  return ids[0] ?? AVATAR_CREATION_TOOL_OWNER_FALLBACK_ID;
}

/**
 * Platform store rejects `ownerAvatarId` for system-tagged avatars; omit the
 * field when the steward is a system avatar (offers still post as that id).
 */
export function stewardPlatformOwnerAvatarId(
  stewardId: string,
  catalog?: readonly Avatar[]
): string | undefined {
  const cat = catalog ?? getAvatarCatalogSnapshot();
  return isSystemAvatarId(stewardId, cat) ? undefined : stewardId;
}

export function __resetAvatarCatalogAccessorForTests(): void {
  catalogAccessor = null;
}
