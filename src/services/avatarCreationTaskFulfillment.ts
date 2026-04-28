/**
 * Marks avatar_creation platform tasks done when a user avatar's `givenName`
 * matches the task's expected name (wikiQuery or "Create avatar:" title), after
 * the user has received the workshop offer (waiting_for_user).
 */

import type { Avatar } from "../types";
import { COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID } from "./monitors/complexTaskPlanner";
import {
  createTaskCompletionEvidence,
  getPlatformStore,
  updateTaskWorkflow,
  type PlatformTaskRecord,
} from "./platform/store";
import { publishPlatformEvent } from "./platform/bus";
import { extractAvatarCreationTaskHints } from "./avatarCreationTaskExecution";

const CREATE_AVATAR_TITLE_PREFIX = /^create\s+avatar\s*:\s*/i;

export function normalizeAvatarCreationTargetName(s: string): string {
  return s.trim().toLowerCase();
}

export function expectedNameFromAvatarCreationTask(
  task: PlatformTaskRecord
): string | null {
  const hints = extractAvatarCreationTaskHints(task.notes);
  const fromWiki = hints?.wikiQuery?.trim();
  if (fromWiki) return fromWiki;
  const fromTitle = task.title.replace(CREATE_AVATAR_TITLE_PREFIX, "").trim();
  return fromTitle || null;
}

/**
 * @returns number of tasks completed this scan
 */
export function scanAvatarCreationTaskFulfillment(
  userAvatars: readonly Avatar[]
): number {
  const store = getPlatformStore();
  const waiting = Object.values(store.tasks)
    .filter(
      (t) =>
        t.requiredCapability?.id === "avatar_creation" &&
        t.workflowStatus === "waiting_for_user" &&
        t.status !== "done" &&
        t.status !== "cancelled"
    )
    .sort((a, b) => a.createdAt - b.createdAt);

  let completed = 0;
  const usedAvatarIds = new Set<string>();

  for (const task of waiting) {
    const expected = expectedNameFromAvatarCreationTask(task);
    if (!expected) continue;
    const want = normalizeAvatarCreationTargetName(expected);
    const match = userAvatars.find(
      (a) =>
        !usedAvatarIds.has(a.id) &&
        normalizeAvatarCreationTargetName(a.givenName) === want
    );
    if (!match) continue;
    usedAvatarIds.add(match.id);

    const evidence = createTaskCompletionEvidence(
      COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
      `Avatar roster match: ${match.givenName} (id ${match.id})`,
      `avatar:${match.id}`
    );

    updateTaskWorkflow({
      taskId: task.id,
      actor: COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
      workflowStatus: "done",
      nextActor: null,
      completionEvidence: [...(task.completionEvidence ?? []), evidence],
      detail: `fulfilled: roster name matches user avatar ${match.id}`,
    });

    publishPlatformEvent({
      type: "avatar_creation_task_satisfied",
      taskId: task.id,
      matchedAvatarId: match.id,
    });
    completed++;
  }

  return completed;
}
