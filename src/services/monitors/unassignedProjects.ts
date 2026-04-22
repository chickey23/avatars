/**
 * `monitor:unassigned_projects` — if any platform-store project lacks an
 * `ownerAvatarId`, post a single synthetic prompt authored by the claimant
 * (default: "Unassigned Project Manager"). The prompt offers two inline
 * actions: "Suggest owners" and "Not now".
 *
 * "Suggest owners" posts one follow-up synthetic message per unassigned
 * project, each with up to 3 avatar-suggestion buttons (top affinity by
 * `projectAffinity.ts`). Clicking a suggestion writes the owner via the
 * platform store and posts a short confirmation.
 *
 * Suggestions are pre-cached keyed by `${projectId}|${updatedAt}|${catalog}`
 * so polling repeatedly with the same state does zero extra work.
 */

import type { Avatar, ConversationMessage } from "../../types";
import {
  completeActiveTasksForProjectExcept,
  dedupeActiveTasksForAvatarProject,
  activeProjectIdsFromLongTermTasks,
} from "../longTermTasks";
import { getPlatformStore, upsertProject } from "../platform/store";
import { filterOutSystemAvatars, getRoutingCatalogRef } from "../platform/routing";
import { appendSessionLog } from "../sessionLog";
import { registerSyntheticAction } from "./actions";
import { postSyntheticMessage } from "./postSynthetic";
import { topAvatarsForProject, type AvatarSuggestion } from "./projectAffinity";
import type { MonitorDef, MonitorRunContext } from "./registry";

export const UNASSIGNED_PROJECTS_MONITOR_NAME = "unassigned_projects" as const;
export const UNASSIGNED_PROJECT_MANAGER_AVATAR_ID =
  "unassigned_project_manager" as const;

const UPM_TAG = `monitor:${UNASSIGNED_PROJECTS_MONITOR_NAME}` as const;

interface CachedSuggestions {
  /** `${projectId}|${updatedAt}|${catalogRevision}` */
  key: string;
  suggestions: AvatarSuggestion[];
}

const suggestionCache = new Map<string, CachedSuggestions>();

function catalogRevision(candidates: readonly Avatar[]): string {
  return candidates.map((a) => a.id).sort().join(",");
}

function getSuggestions(
  project: { id: string; title: string; summary?: string; updatedAt: number },
  candidates: readonly Avatar[]
): AvatarSuggestion[] {
  const rev = catalogRevision(candidates);
  const key = `${project.id}|${project.updatedAt}|${rev}`;
  const hit = suggestionCache.get(project.id);
  if (hit && hit.key === key) return hit.suggestions;
  const suggestions = topAvatarsForProject(candidates, project, 3);
  suggestionCache.set(project.id, { key, suggestions });
  return suggestions;
}

function unassignedProjects(): Array<{
  id: string;
  title: string;
  summary?: string;
  updatedAt: number;
}> {
  const doc = getPlatformStore();
  const tasked = activeProjectIdsFromLongTermTasks();
  const out: Array<{ id: string; title: string; summary?: string; updatedAt: number }> = [];
  for (const p of Object.values(doc.projects)) {
    if (p.ownerAvatarId || p.status === "archived") continue;
    /** Assign-task / tool path may set a long-term task before `ownerAvatarId` exists. */
    if (tasked.has(p.id)) continue;
    out.push({
      id: p.id,
      title: p.title,
      summary: p.summary,
      updatedAt: p.updatedAt,
    });
  }
  return out;
}

export const unassignedProjectsMonitor: MonitorDef = {
  name: UNASSIGNED_PROJECTS_MONITOR_NAME,
  required: true,
  triggers: ["startup", "store_change"],
  description:
    "Prompts the user to assign project owners when any are missing. Suggestions are pre-cached by project revision and catalog fingerprint.",
  run: (ctx: MonitorRunContext) => {
    const unassigned = unassignedProjects();
    if (unassigned.length === 0) return [];
    const candidates = filterOutSystemAvatars(ctx.catalog);
    for (const p of unassigned) getSuggestions(p, candidates);
    const count = unassigned.length;
    return [
      {
        avatarId: ctx.ownerAvatarId,
        content:
          count === 1
            ? "1 project has no owner. Want a suggestion?"
            : `${count} projects have no owner. Want suggestions?`,
        actions: [
          { id: "suggest_all", label: "Suggest owners" },
          { id: "not_now", label: "Not now" },
        ],
        dedupKey: `prompt|${count}|${catalogRevision(candidates)}`,
      },
    ];
  },
};

/** Register concrete per-project action ids right before posting follow-ups. */
function registerActionsForProject(projectId: string, suggestions: AvatarSuggestion[]): void {
  for (const s of suggestions) {
    if (s.score <= 0) continue;
    registerSyntheticAction(
      UPM_TAG,
      `assign:${projectId}:${s.avatarId}`,
      ({ message, action }) => handleAssign(message, action.payload)
    );
  }
  registerSyntheticAction(
    UPM_TAG,
    `skip:${projectId}`,
    ({ message, action }) => handleSkip(message, action.payload)
  );
}

function handleSuggestAll(message: ConversationMessage): void {
  const upmAvatarId = message.avatarId ?? UNASSIGNED_PROJECT_MANAGER_AVATAR_ID;
  const catalog = getRoutingCatalogRef();
  const candidates = filterOutSystemAvatars(catalog);
  const unassigned = unassignedProjects();
  let posted = 0;
  for (const p of unassigned) {
    const suggestions = getSuggestions(p, candidates);
    registerActionsForProject(p.id, suggestions);
    const nonZero = suggestions.filter((s) => s.score > 0);
    const actions = [
      ...nonZero.map((s) => {
        const av = candidates.find((a) => a.id === s.avatarId);
        const label = `${av?.givenName ?? s.avatarId} (${s.score})`;
        return {
          id: `assign:${p.id}:${s.avatarId}`,
          label,
          payload: { projectId: p.id, avatarId: s.avatarId },
        };
      }),
      {
        id: `skip:${p.id}`,
        label: "Skip",
        payload: { projectId: p.id },
      },
    ];
    const body =
      nonZero.length === 0
        ? `${p.title}: no strong matches. Assign manually or skip.`
        : `${p.title}: pick an owner.`;
    const ok = postSyntheticMessage({
      avatarId: upmAvatarId,
      monitorTag: UPM_TAG,
      content: body,
      actions,
      dedupKey: `pick|${p.id}|${p.updatedAt}`,
    });
    if (ok) posted++;
  }
  appendSessionLog("monitors", "upm_suggest_all", {
    level: "info",
    detail: `posted=${posted}`,
  });
}

function handleAssign(message: ConversationMessage, payload: unknown): void {
  const p = payload as { projectId?: string; avatarId?: string } | null;
  if (!p?.projectId || !p.avatarId) return;
  const actor = message.avatarId ?? UNASSIGNED_PROJECT_MANAGER_AVATAR_ID;
  const prior = getPlatformStore().projects[p.projectId];
  if (prior?.ownerAvatarId === p.avatarId) {
    dedupeActiveTasksForAvatarProject(p.avatarId, p.projectId);
    postSyntheticMessage({
      avatarId: actor,
      monitorTag: UPM_TAG,
      content: `"${prior.title}" is already assigned to ${p.avatarId}.`,
      dedupKey: `already|${p.projectId}|${p.avatarId}`,
    });
    return;
  }
  try {
    const rec = upsertProject({
      id: p.projectId,
      title: "",
      ownerAvatarId: p.avatarId,
      actor,
    });
    completeActiveTasksForProjectExcept(p.projectId, p.avatarId);
    dedupeActiveTasksForAvatarProject(p.avatarId, p.projectId);
    postSyntheticMessage({
      avatarId: actor,
      monitorTag: UPM_TAG,
      content: `Assigned "${rec.title}" to ${p.avatarId}.`,
      dedupKey: `assigned|${rec.id}|${Date.now()}`,
    });
  } catch (err) {
    appendSessionLog("monitors", "upm_assign_failed", {
      level: "warn",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}

function handleSkip(_message: ConversationMessage, payload: unknown): void {
  const p = payload as { projectId?: string } | null;
  appendSessionLog("monitors", "upm_skip", {
    level: "info",
    detail: p?.projectId ?? "",
  });
}

/**
 * Register the stable top-level inline actions. Called from the monitors
 * bootstrap on app startup, and from tests after they reset the action
 * registry. Safe to call multiple times.
 */
export function installUnassignedProjectsActions(): void {
  registerSyntheticAction(UPM_TAG, "suggest_all", ({ message }) =>
    handleSuggestAll(message)
  );
  registerSyntheticAction(UPM_TAG, "not_now", () => {
    /* intentional no-op; user can dismiss via Unhelpful if repeated. */
  });
}

/** Test-only: clear suggestion cache between assertions. */
export function __resetUnassignedProjectsForTests(): void {
  suggestionCache.clear();
}
