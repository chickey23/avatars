import type { SituationContext } from "../../types";
import { loadTasks } from "../longTermTasks";

/**
 * Avatars with an active long-term task for the focused project id.
 */
export function listPopInAvatarIdsForProjectFocus(projectId: string | undefined): string[] {
  if (!projectId?.trim()) return [];
  const pid = projectId.trim();
  const tasks = loadTasks();
  const ids = new Set<string>();
  for (const t of tasks) {
    if (t.status !== "active") continue;
    if (t.projectId === pid) {
      ids.add(t.avatarId);
    }
  }
  return [...ids].sort((a, b) => a.localeCompare(b));
}

export function managedProjectIdsForAvatar(avatarId: string): string[] {
  const tasks = loadTasks();
  const ids = new Set<string>();
  for (const t of tasks) {
    if (t.status !== "active" || t.avatarId !== avatarId) continue;
    if (t.projectId) ids.add(t.projectId);
  }
  return [...ids];
}

/** Append pop-in avatars for focused managed project without duplicating ids. */
export function mergePopInIntoResponderIds(
  responderIds: string[],
  ctx: SituationContext
): string[] {
  const extra = listPopInAvatarIdsForProjectFocus(ctx.userFocus?.project?.id);
  const out = [...responderIds];
  for (const id of extra) {
    if (!out.includes(id)) out.push(id);
  }
  return out;
}
