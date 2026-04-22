/**
 * Build a compact project block (stewarded project) for injection into `relevantData`
 * during `processUserTurn`. Surfaces lifecycle fields (status, dueAt,
 * snoozedUntil, ownerAvatarId) and pending tasks so avatars can reason about
 * project state without fetching live connectors.
 *
 * Kept terse (≤ 20 lines per call) so it competes fairly with email rank
 * lines for the prompt budget.
 */

import type { SituationFocus } from "../../types";
import { getPlatformStore } from "./store";

const MAX_TASKS_SHOWN = 8;
const LINE_PREFIX = "Stewarded project";

function formatTs(ts: number): string {
  try {
    return new Date(ts).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return String(ts);
  }
}

/**
 * If the user's focus points at a project known to the platform store, emit
 * a status / lifecycle block plus up to `MAX_TASKS_SHOWN` tasks.
 * Returns `[]` when no focus or no matching project is found.
 */
export function platformFocusedProjectBlock(
  focus: SituationFocus | undefined
): string[] {
  const id = focus?.project?.id;
  if (!id) return [];
  const store = getPlatformStore();
  const project = store.projects[id];
  if (!project) return [];

  const out: string[] = [];
  const header = `${LINE_PREFIX} [${project.id}] "${project.title}" — status=${project.status}`;
  out.push(header);

  if (project.ownerAvatarId) {
    out.push(`  steward: ${project.ownerAvatarId}`);
  }
  if (project.summary) {
    const s = project.summary.length > 240
      ? `${project.summary.slice(0, 237)}…`
      : project.summary;
    out.push(`  summary: ${s}`);
  }
  if (project.dueAt !== undefined) {
    out.push(`  due: ${formatTs(project.dueAt)}`);
  }
  if (project.snoozedUntil !== undefined) {
    out.push(`  snoozed_until: ${formatTs(project.snoozedUntil)}`);
  }

  const tasks = Object.values(store.tasks)
    .filter((t) => t.projectId === project.id && t.status !== "cancelled")
    .sort((a, b) => {
      /** Rank unresolved first, then by due date, then by updatedAt desc. */
      const aResolved = a.status === "done" ? 1 : 0;
      const bResolved = b.status === "done" ? 1 : 0;
      if (aResolved !== bResolved) return aResolved - bResolved;
      const ad = a.dueAt ?? Number.POSITIVE_INFINITY;
      const bd = b.dueAt ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return b.updatedAt - a.updatedAt;
    })
    .slice(0, MAX_TASKS_SHOWN);

  if (tasks.length > 0) {
    out.push(`  tasks (${tasks.length}):`);
    for (const t of tasks) {
      const dueBit = t.dueAt !== undefined ? ` due=${formatTs(t.dueAt)}` : "";
      const ownerBit = t.ownerAvatarId ? ` owner=${t.ownerAvatarId}` : "";
      out.push(`    - [${t.status}] ${t.title}${dueBit}${ownerBit}`);
    }
  }
  return out;
}
