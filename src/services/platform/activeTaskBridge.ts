/**
 * Bridge platform project/task state into SituationContext.activeTask for prompts.
 */

import type { SituationFocus } from "../../types";
import type { PlatformStoreDoc } from "./store";

export function deriveActiveTaskFromPlatform(
  store: PlatformStoreDoc,
  focus: SituationFocus | undefined,
  previousActiveTask: string | undefined
): string | undefined {
  const focusProjectId = focus?.project?.id?.trim();
  if (focusProjectId) {
    const project = store.projects[focusProjectId];
    const openTasks = Object.values(store.tasks)
      .filter(
        (t) =>
          t.projectId === focusProjectId &&
          t.status !== "done" &&
          t.status !== "cancelled"
      )
      .sort((a, b) => a.createdAt - b.createdAt);
    if (openTasks.length > 0) {
      const head = openTasks[0]!;
      return `${project?.title ?? focusProjectId}: ${head.title}`;
    }
    if (project?.title) return project.title;
  }

  const avatarCreation = Object.values(store.tasks)
    .filter(
      (t) =>
        t.requiredCapability?.id === "avatar_creation" &&
        t.status !== "done" &&
        t.status !== "cancelled" &&
        (t.workflowStatus === "open" ||
          t.workflowStatus === "ready" ||
          t.workflowStatus === "waiting_for_user" ||
          t.workflowStatus === "in_progress")
    )
    .sort((a, b) => a.createdAt - b.createdAt)[0];
  if (avatarCreation) return avatarCreation.title;

  return previousActiveTask?.trim() || undefined;
}
