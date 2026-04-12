import type { Avatar, SituationContext } from "../types";
import { defaultAvatars } from "../data/defaultAvatars";

/** Built-in avatars first (with persisted edits), then user-created (no id collision with defaults in v1). */
export function getFullAvatarCatalog(ctx: SituationContext): Avatar[] {
  const edits = ctx.builtinAvatarEdits ?? {};
  const mergedDefaults = defaultAvatars.map((a) => edits[a.id] ?? a);
  const user = ctx.userAvatars ?? [];
  return [...mergedDefaults, ...user];
}

export function findAvatarInCatalog(
  catalog: Avatar[],
  avatarId: string
): Avatar | undefined {
  return catalog.find((a) => a.id === avatarId);
}

/** True if `id` matches a built-in primary avatar. */
export function isDefaultAvatarId(id: string): boolean {
  return defaultAvatars.some((a) => a.id === id);
}
