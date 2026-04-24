/**
 * When an avatar creates/updates world-metadata projects via tools, mirror into
 * long-term tasks and surface in the assign-task UI.
 */

import { upsertProject } from "./platform/store";
import {
  assignTask,
  completeActiveTasksForProjectExcept,
  dedupeActiveTasksForAvatarProject,
  loadTasks,
  saveTasks,
  type LongTermTask,
} from "./longTermTasks";
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
 * Mirrors stewardship into the platform store (`ownerAvatarId`), dedupes duplicate
 * tasks, and completes other avatars' tasks for the same project.
 * Dispatches `avatars:assigned-task` so the app can merge `assignedTasks` on the avatar.
 */
export function ensureProjectTaskForAvatar(
  avatarId: string,
  projectId: string
): LongTermTask | null {
  const proj = getWorldMetadata().projects[projectId];
  if (!proj?.title?.trim()) return null;

  const title = proj.title.trim();
  const description =
    proj.notes?.trim() || proj.summary?.trim() || undefined;

  upsertProject({
    id: projectId,
    title,
    summary: proj.summary?.trim() || null,
    ownerAvatarId: avatarId,
    actor: "user",
  });

  completeActiveTasksForProjectExcept(projectId, avatarId);

  const tasks = loadTasks();
  let existing = tasks.find(
    (t) =>
      t.avatarId === avatarId &&
      t.projectId === projectId &&
      t.status === "active"
  );

  if (!existing) {
    const task = assignTask(avatarId, title, description, projectId);
    dedupeActiveTasksForAvatarProject(avatarId, projectId);
    const after = loadTasks().find((t) => t.id === task.id) ?? task;
    dispatchAssignedTask(avatarId, after.id);
    return after;
  }

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
  dedupeActiveTasksForAvatarProject(avatarId, projectId);
  const afterDedupe = loadTasks();
  existing =
    afterDedupe.find(
      (t) =>
        t.avatarId === avatarId &&
        t.projectId === projectId &&
        t.status === "active"
    ) ?? existing;
  dispatchAssignedTask(avatarId, existing.id);
  return existing;
}
