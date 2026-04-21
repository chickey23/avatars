/**
 * When an avatar creates/updates world-metadata projects via tools, mirror into
 * long-term tasks and surface in the assign-task UI.
 */

import { assignTask, loadTasks, saveTasks } from "./longTermTasks";
import { getWorldMetadata } from "./worldMetadata/store";

function dispatchAssignedTask(avatarId: string, taskId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("avatars:assigned-task", {
      detail: { avatarId, taskId },
    })
  );
}

/**
 * Ensure an active long-term task exists for this avatar + project, assign if missing.
 * Dispatches `avatars:assigned-task` so the app can merge `assignedTasks` on the avatar.
 */
export function ensureProjectTaskForAvatar(
  avatarId: string,
  projectId: string
): void {
  const proj = getWorldMetadata().projects[projectId];
  if (!proj?.title?.trim()) return;

  const title = proj.title.trim();
  const description =
    proj.notes?.trim() || proj.summary?.trim() || undefined;

  const tasks = loadTasks();
  const existing = tasks.find(
    (t) =>
      t.avatarId === avatarId &&
      t.projectId === projectId &&
      t.status === "active"
  );

  if (existing) {
    let changed = false;
    if (existing.title !== title) {
      existing.title = title;
      changed = true;
    }
    const d = description ?? undefined;
    if (existing.description !== d) {
      existing.description = d;
      changed = true;
    }
    if (changed) {
      existing.updatedAt = Date.now();
      saveTasks(tasks);
    }
    return;
  }

  const task = assignTask(avatarId, title, description, projectId);
  dispatchAssignedTask(avatarId, task.id);
}
