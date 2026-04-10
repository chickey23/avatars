/**
 * Long-term task assignment and tracking.
 * Avatars can be assigned tasks; background agents may manage completion.
 */

const TASKS_KEY = "avatars_long_term_tasks";

export interface LongTermTask {
  id: string;
  avatarId: string;
  title: string;
  description?: string;
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
  description?: string
): LongTermTask {
  const tasks = loadTasks();
  const task: LongTermTask = {
    id: crypto.randomUUID(),
    avatarId,
    title,
    description,
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

export function getTasksForAvatar(avatarId: string): LongTermTask[] {
  return loadTasks().filter((t) => t.avatarId === avatarId && t.status === "active");
}
