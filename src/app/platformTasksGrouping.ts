import type {
  PlatformTaskRecord,
  PlatformTaskStatus,
  PlatformWorkflowStatus,
} from "../services/platform/store";

export type WorkshopPlatformTaskSummary = {
  id: string;
  title: string;
  status: PlatformTaskStatus;
  workflowStatus: PlatformWorkflowStatus;
  /** For Workshops → Projects Execute parity with Context → Tasks. */
  requiredCapability?: { id: string };
  notes?: string;
};

/**
 * Group platform tasks by `projectId`, sorted by title within each project.
 */
export function groupPlatformTasksByProjectId(
  tasks: Record<string, PlatformTaskRecord>
): Record<string, WorkshopPlatformTaskSummary[]> {
  const map = new Map<string, WorkshopPlatformTaskSummary[]>();
  for (const t of Object.values(tasks)) {
    const pid = t.projectId?.trim();
    if (!pid) continue;
    const row: WorkshopPlatformTaskSummary = {
      id: t.id,
      title: t.title,
      status: t.status,
      workflowStatus: t.workflowStatus ?? "open",
      requiredCapability: t.requiredCapability
        ? { id: t.requiredCapability.id }
        : undefined,
      notes: t.notes,
    };
    const arr = map.get(pid) ?? [];
    arr.push(row);
    map.set(pid, arr);
  }
  const out: Record<string, WorkshopPlatformTaskSummary[]> = {};
  for (const [pid, arr] of map) {
    arr.sort((a, b) =>
      a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
    );
    out[pid] = arr;
  }
  return out;
}
