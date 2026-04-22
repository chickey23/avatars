/**
 * Routing helpers — system avatars (tagged `"system"` in `avatar.systemTags`)
 * are excluded from normal responder routing, the primary avatar strip, and
 * proactive pools. Addressing them is still possible via explicit selection
 * (`forcedResponderIds`).
 *
 * The functions here accept an explicit catalog, but also accept the
 * single-arg legacy signature. For the legacy signature we consult a
 * module-level catalog ref that `AppContext` keeps up-to-date on mount and
 * on catalog changes. This keeps existing call sites working without a
 * ripple edit.
 */

import type { Avatar } from "../../types";
import { hasSystemTag, SYSTEM_TAG } from "../avatarTags";
import { defaultAvatars } from "../../data/defaultAvatars";
import { PLATFORM_ATTRIBUTION_AVATAR_ID } from "./constants";

/**
 * Last-known catalog. Seeded with `defaultAvatars` so that calls originating
 * before `AppContext` has mounted (e.g. tests, early store hydration) still
 * resolve system-ness correctly for built-ins. AppContext replaces this with
 * the merged catalog on mount.
 */
let catalogRef: readonly Avatar[] = defaultAvatars;

/** Called from AppContext on mount and whenever the merged catalog changes. */
export function setRoutingCatalogRef(catalog: readonly Avatar[]): void {
  catalogRef = catalog;
}

export function getRoutingCatalogRef(): readonly Avatar[] {
  return catalogRef;
}

export function isPlatformAttributionAvatarId(id: string | undefined | null): boolean {
  /** Cosmetic-only check (accent color lookup). Behavior must use tags. */
  return !!id && id === PLATFORM_ATTRIBUTION_AVATAR_ID;
}

export function isSystemAvatarId(
  id: string | undefined | null,
  catalog?: readonly Avatar[]
): boolean {
  if (!id) return false;
  const cat = catalog ?? catalogRef;
  const a = cat.find((x) => x.id === id);
  return !!a && hasSystemTag(a, SYSTEM_TAG);
}

export function filterOutSystemAvatars<A extends { id: string; systemTags?: string[] }>(
  avatars: readonly A[]
): A[] {
  return avatars.filter((a) => !hasSystemTag(a, SYSTEM_TAG));
}

/**
 * Default platform-attribution row in the catalog (for accent/labels), if present.
 * Behavior must not depend on this id; use `system` tags and contracts.
 */
export function findPlatformAttributionInCatalog(catalog: readonly Avatar[]): Avatar | undefined {
  return catalog.find((a) => a.id === PLATFORM_ATTRIBUTION_AVATAR_ID);
}

/**
 * Prefer a `system`-tagged avatar for synthetic attribution; otherwise the
 * default platform attribution id.
 */
export function resolvePlatformAttributionFromCatalog(
  catalog: readonly Avatar[]
): string {
  const withSystem = catalog.find((a) => hasSystemTag(a, SYSTEM_TAG));
  if (withSystem) return withSystem.id;
  return PLATFORM_ATTRIBUTION_AVATAR_ID;
}
