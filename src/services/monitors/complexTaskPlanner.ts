import type { ConversationMessage } from "../../types";
import {
  avatarCreationProjectId,
  avatarCreationSubjectSeed,
  avatarCreationTaskId,
  parseAvatarCreationPlan,
  type AvatarCreationPlan,
} from "../complexTasks/avatarCreationPlanner";
import { upsertProject, upsertTask } from "../platform/store";
import { appendSessionLog } from "../sessionLog";
import { registerSyntheticAction } from "./actions";
import { postSyntheticMessage } from "./postSynthetic";
import type { MonitorDef, MonitorRunContext } from "./registry";

export const COMPLEX_TASK_PLANNER_MONITOR_NAME = "complex_task_planner" as const;
export const COMPLEX_TASK_PLANNER_TAG =
  `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}` as const;
export const COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID = "blessed_exchequer";

type CreateTasksPayload = {
  plan: AvatarCreationPlan;
};

function describePlan(plan: AvatarCreationPlan): string {
  if (plan.kind === "named_list") {
    return `I found a multi-step avatar creation request: ${plan.subjects.join(", ")}. Create one project and ${plan.subjects.length} avatar-creation tasks?`;
  }
  return `I found a set-based avatar creation request. I can search for members of "${plan.discoveryQuery}" before creating tasks.`;
}

export const complexTaskPlannerMonitor: MonitorDef = {
  name: COMPLEX_TASK_PLANNER_MONITOR_NAME,
  required: false,
  triggers: ["user_turn"],
  description:
    "Detects simple multi-step avatar creation requests and offers a review card before creating platform tasks.",
  fallbackOwnerAvatarId: COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
  run: (ctx: MonitorRunContext) => {
    const user = ctx.latestUserMessage;
    if (!user?.content) return [];
    const plan = parseAvatarCreationPlan(user.content);
    if (!plan) return [];
    installComplexTaskPlannerDynamicActions(plan.planId);
    const actions =
      plan.kind === "named_list"
        ? [
            {
              id: `create_avatar_tasks:${plan.planId}`,
              label: "Create tasks",
              payload: { plan } satisfies CreateTasksPayload,
            },
            {
              id: `not_now:${plan.planId}`,
              label: "Not now",
              payload: { planId: plan.planId },
            },
          ]
        : [
            {
              id: `search_members:${plan.planId}`,
              label: "Search members",
              payload: { plan } satisfies CreateTasksPayload,
            },
            {
              id: `not_now:${plan.planId}`,
              label: "Not now",
              payload: { planId: plan.planId },
            },
          ];
    return [
      {
        avatarId: ctx.ownerAvatarId,
        content: describePlan(plan),
        actions,
        dedupKey: `user_turn|${user.id}|${plan.planId}`,
      },
    ];
  },
};

function isCreateTasksPayload(payload: unknown): payload is CreateTasksPayload {
  const p = payload as CreateTasksPayload | null;
  return !!p?.plan && Array.isArray(p.plan.subjects);
}

function handleCreateAvatarTasks(
  message: ConversationMessage,
  payload: unknown
): void {
  if (!isCreateTasksPayload(payload)) return;
  const { plan } = payload;
  const actor = message.avatarId ?? "complex_task_planner";
  const project = upsertProject({
    id: avatarCreationProjectId(plan),
    title: plan.projectTitle,
    summary: plan.originalRequest,
    workflowStatus: "open",
    actor,
  });
  let created = 0;
  for (const subject of plan.subjects) {
    const seed = avatarCreationSubjectSeed(plan, subject);
    upsertTask({
      id: avatarCreationTaskId(plan, subject),
      projectId: project.id,
      title: `Create avatar: ${subject}`,
      notes: [
        seed.seedText,
        "",
        "Avatar creation workshop hints:",
        `- seedText: ${seed.seedText}`,
        `- wikiQuery: ${seed.wikiQuery}`,
      ].join("\n"),
      workflowStatus: "open",
      nextActor: "avatar",
      requiredCapability: {
        id: "avatar_creation",
        kind: "tool",
        label: "Avatar creation",
        reason: "Use the Creation workshop/search flow to research and fill the avatar form.",
      },
      approval: {
        policy: "user_approval_required",
        status: "pending",
        requestedAt: Date.now(),
        requestedBy: actor,
        rationale: "Review generated avatar details before saving.",
      },
      actor,
    });
    created++;
  }
  postSyntheticMessage({
    avatarId: actor,
    monitorTag: COMPLEX_TASK_PLANNER_TAG,
    content: `Created "${project.title}" with ${created} avatar-creation tasks.`,
    dedupKey: `created|${project.id}|${created}`,
  });
  appendSessionLog("monitors", "complex_task_plan_created", {
    level: "info",
    detail: `${project.id} tasks=${created}`,
  });
}

function handleSearchMembers(
  message: ConversationMessage,
  payload: unknown
): void {
  if (!isCreateTasksPayload(payload)) return;
  const actor = message.avatarId ?? "complex_task_planner";
  const query = payload.plan.discoveryQuery ?? payload.plan.originalRequest;
  postSyntheticMessage({
    avatarId: actor,
    monitorTag: COMPLEX_TASK_PLANNER_TAG,
    content: `Member discovery is planned for "${query}". This first slice only creates tasks from explicit names.`,
    dedupKey: `search_pending|${payload.plan.planId}`,
  });
}

export function installComplexTaskPlannerDynamicActions(planId: string): void {
  registerSyntheticAction(
    COMPLEX_TASK_PLANNER_TAG,
    `create_avatar_tasks:${planId}`,
    ({ message, action }) => handleCreateAvatarTasks(message, action.payload)
  );
  registerSyntheticAction(
    COMPLEX_TASK_PLANNER_TAG,
    `search_members:${planId}`,
    ({ message, action }) => handleSearchMembers(message, action.payload)
  );
  registerSyntheticAction(COMPLEX_TASK_PLANNER_TAG, `not_now:${planId}`, () => {
    /* User kept the review card without creating tasks. */
  });
}
