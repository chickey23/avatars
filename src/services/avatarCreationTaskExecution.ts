import type { AvatarCreationWorkshopIntent } from "../types";
import {
  COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
} from "./monitors/complexTaskPlanner";
import {
  getPlatformStore,
  updateTaskWorkflow,
  type PlatformStoreDoc,
  type PlatformTaskRecord,
} from "./platform/store";
import { postAvatarCreationWorkshopOffer } from "./avatarCreationOffer";

export type AvatarCreationTaskHints = AvatarCreationWorkshopIntent;

const SEEDED_LINE_RE = /^-\s*(seedText|wikiQuery):\s*(.+)$/i;

export function extractAvatarCreationTaskHints(
  notes: string | undefined
): AvatarCreationTaskHints | null {
  if (!notes?.trim()) return null;
  let seedText = "";
  let wikiQuery = "";
  for (const line of notes.split(/\r?\n/)) {
    const m = line.match(SEEDED_LINE_RE);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "seedtext") seedText = value;
    if (key === "wikiquery") wikiQuery = value;
  }
  if (!seedText && !wikiQuery) return null;
  return {
    ...(seedText ? { seedText: seedText.slice(0, 2000) } : {}),
    ...(wikiQuery ? { wikiQuery: wikiQuery.slice(0, 500) } : {}),
  };
}

/** True when this project already has an avatar-creation step in flight. */
export function projectHasActiveAvatarCreationStep(
  store: PlatformStoreDoc,
  projectId: string
): boolean {
  for (const t of Object.values(store.tasks)) {
    if (t.projectId !== projectId) continue;
    const w = t.workflowStatus;
    if (
      w === "waiting_for_user" ||
      w === "in_progress" ||
      w === "waiting_for_approval"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Next avatar-creation task that should receive an offer: open/ready, has
 * hints, project not busy, project not archived.
 */
export function selectNextQueuedAvatarCreationTask(
  store: PlatformStoreDoc
): PlatformTaskRecord | undefined {
  const candidates: PlatformTaskRecord[] = [];
  for (const t of Object.values(store.tasks)) {
    if (t.requiredCapability?.id !== "avatar_creation") continue;
    if (t.status === "done" || t.status === "cancelled") continue;
    const w = t.workflowStatus ?? "open";
    if (w === "done" || w === "cancelled") continue;
    if (w !== "open" && w !== "ready") continue;
    if (!extractAvatarCreationTaskHints(t.notes)) continue;
    const project = store.projects[t.projectId];
    if (!project || project.status === "archived") continue;
    if (projectHasActiveAvatarCreationStep(store, t.projectId)) continue;
    candidates.push(t);
  }
  candidates.sort((a, b) => a.createdAt - b.createdAt);
  return candidates[0];
}

export function executeAvatarCreationTask(
  task: PlatformTaskRecord,
  options?: { contentIntro?: string }
): boolean {
  if (task.requiredCapability?.id !== "avatar_creation") return false;
  const intent = extractAvatarCreationTaskHints(task.notes);
  if (!intent) return false;
  const posted = postAvatarCreationWorkshopOffer({
    avatarId: COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
    intent,
    linkedPlatformTaskId: task.id,
    contentIntro: options?.contentIntro,
  });
  if (!posted) return false;
  updateTaskWorkflow({
    taskId: task.id,
    actor: COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
    workflowStatus: "waiting_for_user",
    nextActor: "user",
    detail: "avatar creation offer posted",
  });
  return true;
}

/**
 * Attempts exactly one dequeue + offer post (monitor / store subscriptions).
 * Returns whether an offer was posted.
 */
export function advanceAvatarCreationTaskQueue(store?: PlatformStoreDoc): boolean {
  const doc = store ?? getPlatformStore();
  const next = selectNextQueuedAvatarCreationTask(doc);
  if (!next) return false;
  const intro = `Next in queue: ${next.title}.`;
  return executeAvatarCreationTask(next, { contentIntro: intro });
}

export function executeAvatarCreationTaskById(taskId: string): boolean {
  const task = getPlatformStore().tasks[taskId];
  if (!task) return false;
  return executeAvatarCreationTask(task);
}
