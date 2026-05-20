/**
 * When tools fail for an avatar turn, reflect missing requirements on open platform tasks.
 */

import type { WorldviewToolResolutionFailure } from "../../types";
import {
  createTaskBlocker,
  getPlatformStore,
  updateTaskWorkflow,
} from "./store";
import { classifyToolError } from "../toolErrorSelfRepair";

export function applyToolFailuresToAvatarCreationTasks(args: {
  avatarId: string;
  failures: WorldviewToolResolutionFailure[] | undefined;
}): number {
  if (!args.failures?.length) return 0;
  const store = getPlatformStore();
  const relevant = args.failures.filter((f) => {
    const kind = classifyToolError(f.error);
    return kind === "permission_denied" || kind === "missing_required_args";
  });
  if (relevant.length === 0) return 0;

  let updated = 0;
  for (const task of Object.values(store.tasks)) {
    if (task.requiredCapability?.id !== "avatar_creation") continue;
    if (task.status === "done" || task.status === "cancelled") continue;
    if (task.ownerAvatarId && task.ownerAvatarId !== args.avatarId) continue;
    const w = task.workflowStatus ?? "open";
    if (w === "done" || w === "cancelled") continue;

    const failure = relevant[0]!;
    const blocker = createTaskBlocker(
      args.avatarId,
      `Tool blocked: ${failure.tool}`,
      `${failure.error}${failure.argsPreview ? ` — ${failure.argsPreview}` : ""}`
    );
    updateTaskWorkflow({
      taskId: task.id,
      actor: args.avatarId,
      workflowStatus: "blocked",
      nextActor: "user",
      blockers: [...(task.blockers ?? []), blocker],
      detail: `tool_failure:${failure.tool}:${failure.error}`,
    });
    updated++;
    break;
  }
  return updated;
}
