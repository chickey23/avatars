/**
 * Machine-only tag vocabulary for system-ness, tool ownership, and monitor
 * contracts. Replaces hardcoded ID comparisons against `PLATFORM_ATTRIBUTION_AVATAR_ID` so
 * that deleting the default system row leaves the app functional as long as contracts
 * are fulfilled.
 *
 * These helpers are intentionally tiny and pure — they read `avatar.systemTags`
 * only. All semantic knowledge (what "system" means, which tools belong to the
 * `drafts` group, which monitors are required) lives in the call sites.
 */

import type { Avatar } from "../../types";

export const SYSTEM_TAG = "system" as const;
export const TOOL_OWNER_PREFIX = "tool_owner:" as const;
export const MONITOR_PREFIX = "monitor:" as const;

export function hasSystemTag(
  avatar: { systemTags?: string[] } | undefined | null,
  tag: string
): boolean {
  if (!avatar?.systemTags?.length) return false;
  return avatar.systemTags.includes(tag);
}

export function findAvatarsWithTag<A extends { systemTags?: string[] }>(
  catalog: readonly A[],
  tag: string
): A[] {
  return catalog.filter((a) => a.systemTags?.includes(tag));
}

export function toolOwnerTag(group: string): string {
  return `${TOOL_OWNER_PREFIX}${group}`;
}

export function monitorTag(name: string): string {
  return `${MONITOR_PREFIX}${name}`;
}

/**
 * Strip/replace any reserved system tags the user should not be able to edit
 * through the persona form. Edits via the avatar builder must never forge
 * system tags — those live solely as metadata on the default record or via
 * explicit administrative flows.
 */
export function preserveSystemTags(
  incoming: Avatar,
  previous: Avatar | undefined
): Avatar {
  const prevTags = previous?.systemTags;
  if (!prevTags || prevTags.length === 0) return incoming;
  return { ...incoming, systemTags: prevTags };
}
