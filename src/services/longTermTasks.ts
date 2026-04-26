/**
 * Long-term task assignment and tracking.
 * Avatars can be assigned tasks; background agents may manage completion.
 */

import { getPlatformStore } from "./platform/store";

const TASKS_KEY = "avatars_long_term_tasks";

export interface LongTermTask {
  id: string;
  avatarId: string;
  title: string;
  description?: string;
  /** World-metadata project id when the task was created from a project. */
  projectId?: string;
  status: "active" | "completed" | "paused";
  createdAt: number;
  updatedAt: number;
}

export function loadTasks(): LongTermTask[] {
  try {
    const raw = localStorage.getItem(TASKS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveTasks(tasks: LongTermTask[]): void {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  } catch {
    /* ignore */
  }
}

export function assignTask(
  avatarId: string,
  title: string,
  description?: string,
  projectId?: string
): LongTermTask {
  const tasks = loadTasks();
  const task: LongTermTask = {
    id: crypto.randomUUID(),
    avatarId,
    title,
    description,
    projectId,
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  tasks.push(task);
  saveTasks(tasks);
  return task;
}

export function updateTaskStatus(
  taskId: string,
  status: LongTermTask["status"]
): void {
  const tasks = loadTasks();
  const idx = tasks.findIndex((t) => t.id === taskId);
  if (idx >= 0) {
    tasks[idx].status = status;
    tasks[idx].updatedAt = Date.now();
    saveTasks(tasks);
  }
}

export function getProjectAssignmentsForAvatar(
  avatarId: string,
  assignedTaskIds: string[] = []
): LongTermTask[] {
  const assigned = new Set(assignedTaskIds);
  const candidates: LongTermTask[] = loadTasks().filter(
    (t) =>
      t.status === "active" &&
      (t.avatarId === avatarId || assigned.has(t.id))
  );
  for (const p of Object.values(getPlatformStore().projects)) {
    if (p.status === "archived" || p.ownerAvatarId !== avatarId) continue;
    candidates.push({
      id: `platform-project:${p.id}`,
      avatarId,
      title: p.title,
      description: p.summary,
      projectId: p.id,
      status: "active",
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    });
  }
  const byProject = new Map<string, LongTermTask>();
  for (const t of candidates) {
    const key = t.projectId ?? t.id;
    const existing = byProject.get(key);
    if (!existing || t.updatedAt > existing.updatedAt) {
      byProject.set(key, t);
    }
  }
  return [...byProject.values()].sort((a, b) =>
    a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  );
}

export function getTasksForAvatar(avatarId: string): LongTermTask[] {
  return getProjectAssignmentsForAvatar(avatarId);
}

/**
 * Active long-term tasks with a `projectId` imply that project is stewarded in
 * the UI (Assign-task column) even when `ownerAvatarId` was never written in
 * the platform store — used to keep the unassigned-projects monitor in sync.
 */
export function activeProjectIdsFromLongTermTasks(): Set<string> {
  const ids = new Set<string>();
  for (const t of loadTasks()) {
    if (t.status === "active" && t.projectId) ids.add(t.projectId);
  }
  return ids;
}

/**
 * When a project is assigned to avatar A, complete other avatars' active
 * tasks for the same project so only one steward remains.
 */
export function completeActiveTasksForProjectExcept(
  projectId: string,
  keepAvatarId: string
): void {
  const tasks = loadTasks();
  let changed = false;
  const now = Date.now();
  for (const t of tasks) {
    if (
      t.projectId === projectId &&
      t.status === "active" &&
      t.avatarId !== keepAvatarId
    ) {
      t.status = "completed";
      t.updatedAt = now;
      changed = true;
    }
  }
  if (changed) saveTasks(tasks);
}

/**
 * Project deletion keeps old task rows as history, but marks any unresolved
 * assignments complete so routing and avatar task prompts stop treating them
 * as active work.
 */
export function completeTasksForProject(projectId: string): void {
  const tasks = loadTasks();
  let changed = false;
  const now = Date.now();
  for (const t of tasks) {
    if (t.projectId === projectId && t.status !== "completed") {
      t.status = "completed";
      t.updatedAt = now;
      changed = true;
    }
  }
  if (changed) saveTasks(tasks);
}

export function syncUnresolvedTasksForProject(
  projectId: string,
  title: string,
  description?: string
): void {
  const tasks = loadTasks();
  let changed = false;
  const now = Date.now();
  const nextDescription = description ?? undefined;
  for (const t of tasks) {
    if (t.projectId !== projectId || t.status === "completed") continue;
    let taskChanged = false;
    if (t.title !== title) {
      t.title = title;
      taskChanged = true;
    }
    if (t.description !== nextDescription) {
      t.description = nextDescription;
      taskChanged = true;
    }
    if (taskChanged) {
      t.updatedAt = now;
      changed = true;
    }
  }
  if (changed) saveTasks(tasks);
}

/**
 * Collapse duplicate active tasks for the same (avatar, project) pair — keep
 * the most recently updated row.
 */
export function dedupeActiveTasksForAvatarProject(
  avatarId: string,
  projectId: string
): void {
  const tasks = loadTasks();
  const active = tasks.filter(
    (t) =>
      t.avatarId === avatarId &&
      t.projectId === projectId &&
      t.status === "active"
  );
  if (active.length <= 1) return;
  active.sort((a, b) => b.updatedAt - a.updatedAt);
  const now = Date.now();
  for (const t of active.slice(1)) {
    t.status = "completed";
    t.updatedAt = now;
  }
  saveTasks(tasks);
}
