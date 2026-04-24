/**
 * Write-through bridge from shared world metadata projects to execution-facing
 * platform projects and long-term task state.
 */

import {
  completeTasksForProject,
  syncUnresolvedTasksForProject,
} from "./longTermTasks";
import { deleteProject, upsertProject } from "./platform/store";
import {
  patchWorldMetadataProjects,
  type WorldMetadataDoc,
} from "./worldMetadata";
import type { ProjectMetadataRecord } from "./worldMetadata/types";

export type WorldProjectPatch = Partial<
  Record<string, Partial<ProjectMetadataRecord> | null>
>;

export type ProjectExecutionSyncResult = {
  upserted: number;
  deleted: number;
};

function normalizeSummary(summary: string | undefined): string | null {
  const trimmed = summary?.trim();
  return trimmed ? trimmed : null;
}

export function syncPlatformProjectsFromWorldPatch(
  projectPatch: WorldProjectPatch,
  worldProjects: WorldMetadataDoc["projects"],
  actor = "user"
): ProjectExecutionSyncResult {
  let upserted = 0;
  let deleted = 0;
  for (const [id, patch] of Object.entries(projectPatch)) {
    if (patch === null) {
      deleteProject(id, actor);
      completeTasksForProject(id);
      deleted++;
      continue;
    }

    const project = worldProjects[id];
    if (!project?.title?.trim()) continue;
    const title = project.title.trim();
    const description =
      project.notes?.trim() || project.summary?.trim() || undefined;
    upsertProject({
      id,
      title,
      summary: normalizeSummary(project.summary),
      actor,
    });
    syncUnresolvedTasksForProject(id, title, description);
    upserted++;
  }
  return { upserted, deleted };
}

export function patchWorldMetadataProjectsForExecution(
  projectPatch: WorldProjectPatch,
  actor = "user"
): WorldMetadataDoc {
  const next = patchWorldMetadataProjects(projectPatch);
  syncPlatformProjectsFromWorldPatch(projectPatch, next.projects, actor);
  return next;
}
