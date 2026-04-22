import type { Avatar, SituationContext } from "../types";
import { defaultAvatars } from "../data/defaultAvatars";

/**
 * Built-in avatars first (with persisted edits), then user-created.
 *
 * `systemTags` are metadata that a persisted edit should never strip or
 * forge. If an edit lacks `systemTags`, we restore them from the default
 * record; if the default lacks them, nothing is added.
 */
export function getFullAvatarCatalog(ctx: SituationContext): Avatar[] {
  const edits = ctx.builtinAvatarEdits ?? {};
  const mergedDefaults = defaultAvatars.map((a) => {
    const edit = edits[a.id];
    if (!edit) return a;
    if (edit.systemTags && edit.systemTags.length) return edit;
    return a.systemTags && a.systemTags.length
      ? { ...edit, systemTags: a.systemTags }
      : edit;
  });
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
