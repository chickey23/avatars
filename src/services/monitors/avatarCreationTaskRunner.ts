/**
 * When multi-step avatar creation tasks exist in the platform store, posts the
 * next workshop offer automatically (one per idle project, global FIFO by
 * task createdAt). Manual Execute in Context → Tasks uses the same execution
 * path without the "Next in queue" banner.
 */

import { advanceAvatarCreationTaskQueue } from "../avatarCreationTaskExecution";
import type { MonitorDef, MonitorRunContext } from "./registry";
import { COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID } from "./complexTaskPlanner";

export const AVATAR_CREATION_TASK_RUNNER_MONITOR_NAME =
  "avatar_creation_task_runner" as const;

export const avatarCreationTaskRunnerMonitor: MonitorDef = {
  name: AVATAR_CREATION_TASK_RUNNER_MONITOR_NAME,
  required: false,
  triggers: ["startup", "store_change"],
  fallbackOwnerAvatarId: COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
  description:
    "Dequeues the next open avatar_creation platform task and posts the standard workshop offer card.",
  run: (_ctx: MonitorRunContext) => {
    advanceAvatarCreationTaskQueue();
    return [];
  },
};
