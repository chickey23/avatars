import type { ConversationMessage } from "../../types";
import {
  avatarCreationProjectId,
  avatarCreationSubjectSeed,
  avatarCreationTaskId,
  discoveryQueriesForPlan,
  normalizeAvatarCreationSubjectNames,
  parseAvatarCreationPlan,
  stripDiscoveryBoilerplate,
  type AvatarCreationPlan,
} from "../complexTasks/avatarCreationPlanner";
import { parseImplicitSetDiscoveryPlan } from "../complexTasks/chatSetDiscoveryIntent";
import {
  AVATAR_CREATION_TOOL_OWNER_FALLBACK_ID,
  getAvatarCatalogSnapshot,
  resolveAvatarCreationToolOwnerId,
  stewardPlatformOwnerAvatarId,
} from "../avatarCreationRouting";
import {
  discoverSetMembers,
  TAURI_ONLY_NOTICE,
} from "../complexTasks/avatarCreationDiscovery";
import { suggestSetMembersWithOllama } from "../complexTasks/ollamaSetMemberSuggest";
import { getOllamaPresence } from "../ollama";
import type { WikidataSearchEntity } from "../knowledgeBase/wikidataInvoke";
import {
  discoverySetKeyForPlan,
  resolveCastForWork,
  searchRankedWorks,
  wikidataResultToKnowledgeSet,
  type WikidataResolveResult,
} from "../knowledgeBase/wikidataResolve";
import { populateSetFromWikidataForPlan } from "../platform/populateSetTask";
import { upsertProject, upsertTask } from "../platform/store";
import type { DiscoverySourceKind, KnowledgeSetRecord } from "../worldMetadata/types";
import {
  appendSetDiscoveryRun,
  listOrderedPendingCandidates,
  mergeKnowledgeSetPreserveIncremental,
  normalizeWikidataWorkQidForExclude,
  recordExcludedWikidataWorkQids,
  setMemberCandidateStatus,
} from "../worldviewKnowledge/discoveryKnowledge";
import { getKnowledgeSet, upsertKnowledgeSet } from "../worldviewKnowledge/store";
import { appendSessionLog } from "../sessionLog";
import { contractLog } from "../sessionLog/contractLog";
import { registerSyntheticAction } from "./actions";
import { postSyntheticMessage } from "./postSynthetic";
import type { MonitorAction, MonitorDef, MonitorRunContext } from "./registry";
import { filterOutSystemAvatars } from "../platform/routing";

export const COMPLEX_TASK_PLANNER_MONITOR_NAME = "complex_task_planner" as const;
export const COMPLEX_TASK_PLANNER_TAG =
  `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}` as const;
export const COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID =
  AVATAR_CREATION_TOOL_OWNER_FALLBACK_ID;

const MIN_WIKIDATA_CAST_ACCEPT = 3;

function upsertKnowledgeSetMergedLocal(next: KnowledgeSetRecord): void {
  const prev = getKnowledgeSet(next.setKey);
  upsertKnowledgeSet(mergeKnowledgeSetPreserveIncremental(prev, next));
}

/** Advisory only: not enforced by code. Shown on set-discovery monitor and discovery results. */
const AVATAR_SUBJECT_STEWARDSHIP_NOTE =
  "Stewardship: prefer fictional, mythological, symbolic, or historical figures you are comfortable representing. " +
  "Avatars of living people or the recently deceased (about the last ~20 years) are discouraged as distasteful; " +
  "the app does not block this—you choose.";

/** Monotonic suffix so two discovery cards in the same ms are not deduped away. */
let discoveryResultPostSeq = 0;

type CreateTasksPayload = {
  plan: AvatarCreationPlan;
  /** Which phrase from `discoverySearchQueries` to use for legacy search (rotates on Search again). */
  discoveryAttemptIndex?: number;
};

type MemberPickPayload = CreateTasksPayload & {
  normalizedKey: string;
  displayName: string;
};

type PickWorkPayload = CreateTasksPayload & {
  workQid: string;
  workLabel: string;
};

function isPickWorkPayload(p: unknown): p is PickWorkPayload {
  if (!isCreateTasksPayload(p)) return false;
  const x = p as PickWorkPayload;
  return (
    typeof x.workQid === "string" &&
    /^Q\d+$/i.test(x.workQid.trim()) &&
    typeof x.workLabel === "string" &&
    x.workLabel.trim().length > 0
  );
}

function buildSetPlatformTitle(plan: AvatarCreationPlan): string {
  const raw = (plan.discoveryQuery ?? plan.originalRequest).trim();
  return `Build set: ${stripDiscoveryBoilerplate(raw)}`;
}

function actionKeySegment(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "m";
}

/**
 * Ensures the durable platform project exists for incremental set discovery.
 * Created on the first successful discovery pass so work is tracked, not discarded.
 */
function ensureSetBuildPlatformProject(plan: AvatarCreationPlan, actor: string): void {
  if (plan.kind !== "set_discovery") return;
  const catalog = getAvatarCatalogSnapshot();
  const ownerField = stewardPlatformOwnerAvatarId(actor, catalog);
  upsertProject({
    id: avatarCreationProjectId(plan),
    title: buildSetPlatformTitle(plan),
    summary: plan.originalRequest,
    workflowStatus: "open",
    status: "active",
    actor,
    ...(ownerField ? { ownerAvatarId: ownerField } : {}),
  });
}

function describePlan(plan: AvatarCreationPlan): string {
  if (plan.kind === "named_list") {
    return `I found a multi-step avatar creation request: ${plan.subjects.join(", ")}. Create one project and ${plan.subjects.length} avatar-creation tasks?`;
  }
  if (plan.chatImplicitSetDiscovery) {
    return (
      `I can run **set discovery** (Wikidata / search) for **"${plan.discoveryQuery ?? stripDiscoveryBoilerplate(plan.originalRequest)}"** and save results to your local worldview. ` +
      `Use **Search members** to start, or **Not now** to skip.`
    );
  }
  return `I found a set-based avatar creation request. I can search for members of "${plan.discoveryQuery}" before creating tasks.\n\n${AVATAR_SUBJECT_STEWARDSHIP_NOTE}`;
}

export const complexTaskPlannerMonitor: MonitorDef = {
  name: COMPLEX_TASK_PLANNER_MONITOR_NAME,
  required: false,
  triggers: ["user_turn"],
  description:
    "Detects multi-step avatar creation and implicit roster/set-discovery chat; offers a review card before Search members / platform tasks.",
  fallbackOwnerAvatarId: COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
  run: (ctx: MonitorRunContext) => {
    const user = ctx.latestUserMessage;
    if (!user?.content) return [];
    const plan =
      parseAvatarCreationPlan(user.content) ??
      parseImplicitSetDiscoveryPlan(user.content);
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
              id: `edit_named_list:${plan.planId}`,
              label: "Edit list",
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
    const routableIds = new Set(filterOutSystemAvatars(ctx.catalog).map((a) => a.id));
    const primaryId = ctx.primaryAvatarId;
    const attributedId =
      primaryId && routableIds.has(primaryId) ? primaryId : ctx.ownerAvatarId;
    const dedupScope = plan.chatImplicitSetDiscovery ? "implicit_set" : "explicit_plan";
    return [
      {
        avatarId: attributedId,
        content: describePlan(plan),
        actions,
        dedupKey: `user_turn|${user.id}|${dedupScope}|${plan.planId}`,
      },
    ];
  },
};

function isCreateTasksPayload(payload: unknown): payload is CreateTasksPayload {
  const p = payload as CreateTasksPayload | null;
  return !!p?.plan && Array.isArray(p.plan.subjects);
}

function forceLegacyDiscovery(): boolean {
  try {
    if (
      typeof process !== "undefined" &&
      process.env?.AVATARS_FORCE_LEGACY_DISCOVERY === "1"
    ) {
      return true;
    }
  } catch {
    /* ignore */
  }
  try {
    const v = (
      import.meta as ImportMeta & {
        env?: { VITE_FORCE_LEGACY_DISCOVERY?: string };
      }
    ).env?.VITE_FORCE_LEGACY_DISCOVERY;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Creates or updates avatar-creation tasks for each subject. `plan` may be
 * `named_list` or `set_discovery` with `subjects` filled for this batch.
 */
function upsertAvatarCreationTasksForSubjects(
  message: ConversationMessage,
  plan: AvatarCreationPlan,
  subjects: string[]
): number {
  const catalog = getAvatarCatalogSnapshot();
  const stewardId = resolveAvatarCreationToolOwnerId(catalog);
  const ownerField = stewardPlatformOwnerAvatarId(stewardId, catalog);
  const actor = stewardId;
  const project = upsertProject({
    id: avatarCreationProjectId(plan),
    title:
      (plan.discoveryQuery ?? "").trim().length > 0
        ? buildSetPlatformTitle({
            ...plan,
            kind: "set_discovery",
            discoveryQuery: plan.discoveryQuery ?? plan.originalRequest,
          })
        : plan.projectTitle,
    summary: plan.originalRequest,
    workflowStatus: "open",
    status: "active",
    actor,
    ...(ownerField ? { ownerAvatarId: ownerField } : {}),
  });
  const setKey =
    plan.discoveryQuery || plan.kind === "set_discovery"
      ? discoverySetKeyForPlan(plan)
      : null;
  const ks = setKey ? getKnowledgeSet(setKey) : null;

  let created = 0;
  for (const subject of subjects) {
    const seed = avatarCreationSubjectSeed(plan, subject);
    const mem = ks?.members.find(
      (m) =>
        m.name === subject ||
        m.name.toLowerCase().trim() === subject.toLowerCase().trim()
    );
    const voiceLine =
      mem?.actor?.trim() && mem.actor.trim().length > 0
        ? `\n- voiceActor (Wikidata): ${mem.actor.trim()}`
        : "";
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
        voiceLine,
        ...(plan.discoveryQuery?.trim()
          ? [
              "",
              `Stewardship (advisory): ${AVATAR_SUBJECT_STEWARDSHIP_NOTE}`,
            ]
          : []),
      ]
        .filter(Boolean)
        .join("\n"),
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
      ...(ownerField ? { ownerAvatarId: ownerField } : {}),
    });
    created++;
  }
  postSyntheticMessage({
    avatarId: message.avatarId ?? stewardId,
    monitorTag: COMPLEX_TASK_PLANNER_TAG,
    content: `Created "${project.title}" with ${created} avatar-creation tasks.`,
    dedupKey: `created|${project.id}|${created}`,
  });
  appendSessionLog("monitors", "complex_task_plan_created", {
    level: "info",
    detail: `${project.id} tasks=${created}`,
  });
  if (plan.discoveryQuery && subjects.length > 0) {
    contractLog(
      COMPLEX_TASK_PLANNER_MONITOR_NAME,
      "tasks_created_from_discovery",
      `${project.id} tasks=${created}`,
      { level: "info" }
    );
  }
  return created;
}

function handleCreateAvatarTasks(
  message: ConversationMessage,
  payload: unknown
): void {
  if (!isCreateTasksPayload(payload)) return;
  const { plan } = payload;
  upsertAvatarCreationTasksForSubjects(message, plan, plan.subjects);
}

function isMemberPickPayload(p: unknown): p is MemberPickPayload {
  if (!isCreateTasksPayload(p)) return false;
  const x = p as MemberPickPayload;
  return (
    typeof x.normalizedKey === "string" &&
    x.normalizedKey.length > 0 &&
    typeof x.displayName === "string" &&
    x.displayName.length > 0
  );
}

function handleCreateDiscoveryMember(
  message: ConversationMessage,
  payload: unknown
): void {
  if (!isMemberPickPayload(payload)) return;
  const { plan, normalizedKey, displayName } = payload;
  const catalog = getAvatarCatalogSnapshot();
  const actor = resolveAvatarCreationToolOwnerId(catalog);
  ensureSetBuildPlatformProject(plan, actor);
  const setKey = discoverySetKeyForPlan(plan);
  const planForTask: AvatarCreationPlan = {
    ...plan,
    kind: "named_list",
    subjects: [displayName],
    projectTitle: plan.projectTitle,
  };
  upsertAvatarCreationTasksForSubjects(message, planForTask, [displayName]);
  setMemberCandidateStatus(setKey, normalizedKey, "task_spawned");
  void postDiscoveryProgressCard(message, plan, actor, payload.discoveryAttemptIndex);
}

function handleSkipDiscoveryMember(
  message: ConversationMessage,
  payload: unknown
): void {
  if (!isMemberPickPayload(payload)) return;
  const catalog = getAvatarCatalogSnapshot();
  const actor = resolveAvatarCreationToolOwnerId(catalog);
  const setKey = discoverySetKeyForPlan(payload.plan);
  setMemberCandidateStatus(setKey, payload.normalizedKey, "skipped");
  void postDiscoveryProgressCard(
    message,
    payload.plan,
    actor,
    payload.discoveryAttemptIndex
  );
}

function handleCreateAllPendingMembers(
  message: ConversationMessage,
  payload: unknown
): void {
  if (!isCreateTasksPayload(payload)) return;
  const { plan } = payload;
  const setKey = discoverySetKeyForPlan(plan);
  const pending = listOrderedPendingCandidates(getKnowledgeSet(setKey));
  if (pending.length === 0) return;
  const catalog = getAvatarCatalogSnapshot();
  const actor = resolveAvatarCreationToolOwnerId(catalog);
  ensureSetBuildPlatformProject(plan, actor);
  const planForTask: AvatarCreationPlan = {
    ...plan,
    kind: "named_list",
    subjects: pending.map((p) => p.displayName),
    projectTitle: plan.projectTitle,
  };
  upsertAvatarCreationTasksForSubjects(
    message,
    planForTask,
    pending.map((p) => p.displayName)
  );
  for (const p of pending) {
    setMemberCandidateStatus(setKey, p.normalizedKey, "task_spawned");
  }
  void postDiscoveryProgressCard(message, plan, actor, payload.discoveryAttemptIndex);
}

function handleEditNamedList(
  message: ConversationMessage,
  payload: unknown
): void {
  if (!isCreateTasksPayload(payload)) return;
  const { plan } = payload;
  const listed = plan.subjects.map((s) => `- ${s}`).join("\n");
  postSyntheticMessage({
    avatarId: message.avatarId ?? COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
    monitorTag: COMPLEX_TASK_PLANNER_TAG,
    content:
      `**Edit list** — current names:\n${listed}\n\n` +
      "Reply in chat with corrections (for example: remove Carol, add Dave), then use **Create tasks** on the review card when the list looks right.",
    dedupKey: `edit_named|${plan.planId}|${discoveryResultPostSeq++}`,
  });
}

function handleEditDiscoveryList(
  message: ConversationMessage,
  payload: unknown
): void {
  if (!isCreateTasksPayload(payload)) return;
  const { plan } = payload;
  const setKey = discoverySetKeyForPlan(plan);
  const ks = getKnowledgeSet(setKey);
  const members = ks?.members ?? [];
  const lines =
    members.length > 0
      ? members
          .map(
            (m) =>
              `- ${m.name}${m.status && m.status !== "pending" ? ` (${m.status})` : ""}`
          )
          .join("\n")
      : "(no members saved yet — run **Search members** first)";
  postSyntheticMessage({
    avatarId: message.avatarId ?? COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
    monitorTag: COMPLEX_TASK_PLANNER_TAG,
    content:
      `**Edit list** for "${stripDiscoveryBoilerplate(plan.discoveryQuery ?? plan.originalRequest)}":\n${lines}\n\n` +
      "Reply in chat to add or remove names, or use **Skip** / **Create avatar** on the progress card.",
    dedupKey: `edit_discovery|${plan.planId}|${discoveryResultPostSeq++}`,
  });
}

function handleDoneBuildingSet(message: ConversationMessage, payload: unknown): void {
  if (!isCreateTasksPayload(payload)) return;
  const catalog = getAvatarCatalogSnapshot();
  const stewardId = resolveAvatarCreationToolOwnerId(catalog);
  const ownerField = stewardPlatformOwnerAvatarId(stewardId, catalog);
  const actor = stewardId;
  upsertProject({
    id: avatarCreationProjectId(payload.plan),
    title: buildSetPlatformTitle(payload.plan),
    summary: payload.plan.originalRequest,
    workflowStatus: "done",
    status: "done",
    actor,
    ...(ownerField ? { ownerAvatarId: ownerField } : {}),
  });
  postSyntheticMessage({
    avatarId: message.avatarId ?? stewardId,
    monitorTag: COMPLEX_TASK_PLANNER_TAG,
    content: `Marked **${buildSetPlatformTitle(payload.plan)}** as done. You can start a new search anytime from a fresh request.`,
    dedupKey: `set_done|${payload.plan.planId}|${discoveryResultPostSeq++}`,
  });
}

function formatDiscoveryProgressBody(
  plan: AvatarCreationPlan,
  pending: ReturnType<typeof listOrderedPendingCandidates>,
  options?: { omitStewardship?: boolean }
): string {
  const omitStewardship =
    options?.omitStewardship === true || plan.chatImplicitSetDiscovery === true;
  const ks = getKnowledgeSet(discoverySetKeyForPlan(plan));
  const runs = ks?.discoveryRuns?.length ?? 0;
  const lines: string[] = [];
  lines.push(
    `**${buildSetPlatformTitle(plan)}** — this pass is saved locally (${runs} run(s) on record).`
  );
  if (pending.length === 0) {
    lines.push(
      "\nNo pending name suggestions (everything skipped or queued). **Search again** to find more, or **Done building set**."
    );
    if (!omitStewardship) lines.push(`\n\n${AVATAR_SUBJECT_STEWARDSHIP_NOTE}`);
    return lines.join("");
  }
  lines.push(
    `\nPending (${pending.length}): ${pending.map((p) => p.displayName).join(", ")}`
  );
  if (!omitStewardship) lines.push(`\n\n${AVATAR_SUBJECT_STEWARDSHIP_NOTE}`);
  lines.push(
    "\n**Create avatar** / **Skip** the first suggestion, **Create all pending** for a batch, **Search again**, or **Done building set**."
  );
  return lines.join("");
}

/**
 * Registers handlers for Search again / Done / per-member picks. Call before each discovery card.
 */
function registerSetDiscoveryCardActions(plan: AvatarCreationPlan): void {
  registerSyntheticAction(
    COMPLEX_TASK_PLANNER_TAG,
    `search_discovery_again:${plan.planId}`,
    async ({ message: m, action }) => {
      const pl = action.payload as CreateTasksPayload | undefined;
      if (!pl?.plan) return;
      await handleSearchMembersAsync(m, pl);
    }
  );
  registerSyntheticAction(
    COMPLEX_TASK_PLANNER_TAG,
    `done_building_set:${plan.planId}`,
    ({ message, action }) => handleDoneBuildingSet(message, action.payload)
  );
  registerOllamaSetSuggestSyntheticActionForPlan(plan);
}

/** Shared registration + actions for discovery outcome cards (search + member picks). */
function registerAndBuildSetDiscoveryActions(
  plan: AvatarCreationPlan,
  lastCompletedAttempt: number,
  pending: ReturnType<typeof listOrderedPendingCandidates>
): MonitorAction[] {
  registerSetDiscoveryCardActions(plan);
  registerSyntheticAction(
    COMPLEX_TASK_PLANNER_TAG,
    `edit_discovery_list:${plan.planId}`,
    ({ message: m, action }) => handleEditDiscoveryList(m, action.payload)
  );
  const next = pending[0];
  if (next) {
    const seg = actionKeySegment(next.normalizedKey);
    registerSyntheticAction(
      COMPLEX_TASK_PLANNER_TAG,
      `create_member:${plan.planId}:${seg}`,
      ({ message: m, action }) => handleCreateDiscoveryMember(m, action.payload)
    );
    registerSyntheticAction(
      COMPLEX_TASK_PLANNER_TAG,
      `skip_member:${plan.planId}:${seg}`,
      ({ message: m, action }) => handleSkipDiscoveryMember(m, action.payload)
    );
  }
  if (pending.length > 1) {
    registerSyntheticAction(
      COMPLEX_TASK_PLANNER_TAG,
      `create_all_pending:${plan.planId}`,
      ({ message: m, action }) => handleCreateAllPendingMembers(m, action.payload)
    );
  }

  const actions: MonitorAction[] = [];
  if (next) {
    actions.push({
      id: `create_member:${plan.planId}:${actionKeySegment(next.normalizedKey)}`,
      label: `Create avatar: ${next.displayName}`,
      payload: {
        plan,
        normalizedKey: next.normalizedKey,
        displayName: next.displayName,
        subjects: [],
        discoveryAttemptIndex: lastCompletedAttempt,
      } satisfies MemberPickPayload,
    });
    actions.push({
      id: `skip_member:${plan.planId}:${actionKeySegment(next.normalizedKey)}`,
      label: `Skip: ${next.displayName}`,
      payload: {
        plan,
        normalizedKey: next.normalizedKey,
        displayName: next.displayName,
        subjects: [],
        discoveryAttemptIndex: lastCompletedAttempt,
      } satisfies MemberPickPayload,
    });
  }
  if (pending.length > 1) {
    actions.push({
      id: `create_all_pending:${plan.planId}`,
      label: `Create all pending (${pending.length})`,
      payload: {
        plan,
        subjects: [],
        discoveryAttemptIndex: lastCompletedAttempt,
      } satisfies CreateTasksPayload,
    });
  }
  actions.push({
    id: `edit_discovery_list:${plan.planId}`,
    label: "Edit list",
    payload: { plan, subjects: [] } satisfies CreateTasksPayload,
  });
  actions.push({
    id: `search_discovery_again:${plan.planId}`,
    label: "Search again",
    payload: {
      plan,
      discoveryAttemptIndex: lastCompletedAttempt + 1,
    } satisfies CreateTasksPayload,
  });
  actions.push({
    id: `done_building_set:${plan.planId}`,
    label: "Done building set",
    payload: { plan, subjects: [] } satisfies CreateTasksPayload,
  });
  return actions;
}

async function maybeAugmentActionsWithOllamaSuggest(
  actions: MonitorAction[],
  plan: AvatarCreationPlan,
  usedAttempt: number
): Promise<MonitorAction[]> {
  if ((await getOllamaPresence()) !== "ready") return actions;
  if (actions.some((a) => a.id.startsWith(`suggest_set_members_ollama:${plan.planId}`))) {
    return actions;
  }
  return [
    ...actions,
    {
      id: `suggest_set_members_ollama:${plan.planId}`,
      label: "Suggest members (local LLM)",
      hint: "Uses Ollama on this machine — unverified names; review before creating avatars.",
      payload: {
        plan,
        subjects: [],
        discoveryAttemptIndex: usedAttempt,
      } satisfies CreateTasksPayload,
    },
  ];
}

async function postDiscoveryProgressCard(
  message: ConversationMessage,
  plan: AvatarCreationPlan,
  actor: string,
  discoveryAttemptIndex?: number
): Promise<void> {
  const setKey = discoverySetKeyForPlan(plan);
  const pending = listOrderedPendingCandidates(getKnowledgeSet(setKey));
  const attempt =
    typeof discoveryAttemptIndex === "number" ? discoveryAttemptIndex : 0;
  const actions = await maybeAugmentActionsWithOllamaSuggest(
    registerAndBuildSetDiscoveryActions(plan, attempt, pending),
    plan,
    attempt
  );
  postSyntheticMessage({
    avatarId: message.avatarId ?? actor,
    monitorTag: COMPLEX_TASK_PLANNER_TAG,
    content: formatDiscoveryProgressBody(plan, pending),
    actions,
    dedupKey: `discovery_progress|${plan.planId}|${discoveryResultPostSeq++}`,
  });
}

function formatDiscoveryResultBody(
  plan: AvatarCreationPlan,
  result: Awaited<ReturnType<typeof discoverSetMembers>>,
  options?: {
    legacySearchQuery?: string;
    fromLegacy?: boolean;
    fromOllama?: boolean;
    omitStewardship?: boolean;
  }
): string {
  const q =
    options?.legacySearchQuery ??
    plan.discoveryQuery ??
    plan.originalRequest;
  const header = `Discovery for "${q}":`;
  const stewBlock =
    options?.omitStewardship === true ? "" : `\n\n${AVATAR_SUBJECT_STEWARDSHIP_NOTE}`;
  if (result.names.length === 0) {
    const tauriHint = result.notices.some((n) => n === TAURI_ONLY_NOTICE)
      ? "\n\nNote: Member search runs in the **desktop app** (Tauri). In the browser, open **Workshops → Creation**, or retry on desktop.\n"
      : "";
    const sources =
      result.sourceLines.length > 0
        ? `\n\nSources (truncated):\n${result.sourceLines.slice(0, 8).join("\n")}`
        : "";
    return `${header}${stewBlock}\n\nNo member names were extracted from search hits.${tauriHint}${sources}`;
  }
  const list = result.names.map((n, i) => `${i + 1}. ${n}`).join("\n");
  const legacyNote = options?.fromLegacy
    ? "\n\n**Source:** web search snippets — names are **heuristic guesses** from page titles and text, not a curated cast list. If this looks wrong, use **Search again**, pick a **Wikidata work** when offered, or rephrase (e.g. the exact show title)."
    : "";
  const ollamaNote = options?.fromOllama
    ? "\n\n**Source:** suggested by **local LLM (Ollama)** — names are **unverified** and may be wrong for the franchise or mix episodes with characters. Treat as draft ideas; use **Search again**, pick a **Wikidata work** when offered, or refine before creating avatars."
    : "";
  return `${header}\n\nCandidates (${result.names.length}):\n${list}${stewBlock}\n\nEach pass is saved to your local worldview. Use the buttons to create avatars one at a time, skip, run another search, or mark the set build done.${legacyNote}${ollamaNote}`;
}

function discoverySourceKindFromEmitOpts(
  resultForUi: Awaited<ReturnType<typeof discoverSetMembers>>,
  opts: {
    wd?: Awaited<ReturnType<typeof populateSetFromWikidataForPlan>>;
    fromLegacy?: boolean;
    fromOllama?: boolean;
  }
): DiscoverySourceKind {
  if (opts.fromOllama) return "ollama";
  if (opts.fromLegacy) return "legacy_web";
  const joined = resultForUi.sourceLines.join("\n");
  if (joined.includes("wikidata_work_picked")) return "wikidata_work_pick";
  if (opts.wd?.usedWikidata) return "wikidata_auto";
  return "legacy_web";
}

async function emitDiscoveryOutcome(
  message: ConversationMessage,
  plan: AvatarCreationPlan,
  actor: string,
  usedAttempt: number,
  resultForUi: Awaited<ReturnType<typeof discoverSetMembers>>,
  opts: {
    wd?: Awaited<ReturnType<typeof populateSetFromWikidataForPlan>>;
    legacySearchQueryUsed?: string;
    legacyQuery: string;
    fromLegacy?: boolean;
    fromOllama?: boolean;
    ollamaSeedForRun?: string;
  }
): Promise<void> {
  const normalizedSubjects = normalizeAvatarCreationSubjectNames(resultForUi.names);
  const resultNormalized: Awaited<ReturnType<typeof discoverSetMembers>> = {
    ...resultForUi,
    names: normalizedSubjects,
  };
  contractLog(
    COMPLEX_TASK_PLANNER_MONITOR_NAME,
    "discovery_results",
    `names=${normalizedSubjects.length}`,
    { level: "info" }
  );

  const queryForRun =
    opts.wd?.successfulQuery ??
    opts.legacySearchQueryUsed ??
    (opts.fromOllama
      ? `ollama(${opts.ollamaSeedForRun ?? opts.legacyQuery})`
      : opts.legacyQuery);
  const relatedHints: string[] = [];
  if (opts.wd?.workQidHint) relatedHints.push(`wd:work:${opts.wd.workQidHint}`);
  if (opts.wd?.workLabelHint) relatedHints.push(`workLabel:${opts.wd.workLabelHint}`);

  appendSetDiscoveryRun({
    setKey: discoverySetKeyForPlan(plan),
    labelFallback: buildSetPlatformTitle(plan),
    query: queryForRun,
    notices: [...resultNormalized.notices],
    sourceLines: resultNormalized.sourceLines.slice(0, 24),
    extractedNames: normalizedSubjects,
    workQid: opts.wd?.workQidHint,
    workLabel: opts.wd?.workLabelHint,
    relatedSetHints: relatedHints.length ? relatedHints : undefined,
    sourceKind: discoverySourceKindFromEmitOpts(resultNormalized, opts),
  });

  ensureSetBuildPlatformProject(plan, actor);

  const pending = listOrderedPendingCandidates(
    getKnowledgeSet(discoverySetKeyForPlan(plan))
  );
  const actions = await maybeAugmentActionsWithOllamaSuggest(
    registerAndBuildSetDiscoveryActions(plan, usedAttempt, pending),
    plan,
    usedAttempt
  );
  actions.push({
    id: `not_now:${plan.planId}`,
    label: "Skip",
    payload: { planId: plan.planId },
  });

  const baseBody = formatDiscoveryResultBody(plan, resultNormalized, {
    legacySearchQuery: opts.legacySearchQueryUsed,
    fromLegacy: opts.fromLegacy,
    fromOllama: opts.fromOllama,
    omitStewardship: plan.chatImplicitSetDiscovery === true,
  });
  const progressBody = formatDiscoveryProgressBody(plan, pending);
  const combinedBody = `${baseBody}\n\n---\n\n${progressBody}`;

  postSyntheticMessage({
    avatarId: message.avatarId ?? actor,
    monitorTag: COMPLEX_TASK_PLANNER_TAG,
    content: combinedBody,
    actions,
    dedupKey: `discovery_result|${plan.planId}|${discoveryResultPostSeq++}`,
  });
}

async function handleSuggestSetMembersOllama(
  message: ConversationMessage,
  payload: CreateTasksPayload
): Promise<void> {
  if (!isCreateTasksPayload(payload)) return;
  const catalog = getAvatarCatalogSnapshot();
  const actor = resolveAvatarCreationToolOwnerId(catalog);
  const plan = payload.plan;
  const usedAttempt =
    typeof payload.discoveryAttemptIndex === "number"
      ? payload.discoveryAttemptIndex
      : 0;
  const discoveryQueries = discoveryQueriesForPlan(plan);
  const legacyQuery =
    discoveryQueries[usedAttempt % discoveryQueries.length] ??
    plan.discoveryQuery ??
    plan.originalRequest;
  const primarySeed = (
    discoveryQueries[0] ??
    plan.discoveryQuery ??
    plan.originalRequest
  ).trim();

  contractLog(
    COMPLEX_TASK_PLANNER_MONITOR_NAME,
    "ollama_suggest_user_clicked",
    `plan=${plan.planId} attempt=${usedAttempt}`,
    { level: "info" }
  );

  const result = await suggestSetMembersWithOllama(plan, { seed: primarySeed });
  const notReady = result.notices.find((n) => n.startsWith("ollama_not_ready:"));
  if (notReady) {
    const presence = notReady.slice("ollama_not_ready:".length) || "unavailable";
    registerSetDiscoveryCardActions(plan);
    postSyntheticMessage({
      avatarId: message.avatarId ?? actor,
      monitorTag: COMPLEX_TASK_PLANNER_TAG,
      content: `**Ollama is not ready** (${presence}). Start Ollama and pull a model, then try **Suggest members (local LLM)** again.`,
      actions: [
        {
          id: `search_discovery_again:${plan.planId}`,
          label: "Search again",
          payload: {
            plan,
            discoveryAttemptIndex: usedAttempt + 1,
          } satisfies CreateTasksPayload,
        },
        {
          id: `not_now:${plan.planId}`,
          label: "Skip",
          payload: { planId: plan.planId },
        },
      ],
      dedupKey: `ollama_not_ready|${plan.planId}|${discoveryResultPostSeq++}`,
    });
    return;
  }
  const fromOllama = result.notices.includes("ollama_suggested");
  await emitDiscoveryOutcome(message, plan, actor, usedAttempt, result, {
    legacyQuery,
    fromLegacy: false,
    fromOllama,
    ollamaSeedForRun: primarySeed,
  });
}

function registerOllamaSetSuggestSyntheticActionForPlan(plan: AvatarCreationPlan): void {
  registerSyntheticAction(
    COMPLEX_TASK_PLANNER_TAG,
    `suggest_set_members_ollama:${plan.planId}`,
    async ({ message: m, action }) => {
      const pl = action.payload as CreateTasksPayload | undefined;
      if (!pl?.plan) return;
      await handleSuggestSetMembersOllama(m, pl);
    }
  );
}

async function handlePickWikidataWork(
  message: ConversationMessage,
  payload: unknown
): Promise<void> {
  if (!isPickWorkPayload(payload)) return;
  const actor = resolveAvatarCreationToolOwnerId(getAvatarCatalogSnapshot());
  const { plan, workQid, workLabel } = payload;
  const usedAttempt =
    typeof payload.discoveryAttemptIndex === "number"
      ? payload.discoveryAttemptIndex
      : 0;
  const discoveryQueries = discoveryQueriesForPlan(plan);
  const legacyQuery =
    discoveryQueries[usedAttempt % discoveryQueries.length] ??
    plan.discoveryQuery ??
    plan.originalRequest;

  const cast = await resolveCastForWork(workQid.trim());
  if (
    cast.notices.includes("wikidata_sparql_error") ||
    cast.notices.includes("wikidata_sparql_unavailable")
  ) {
    registerSetDiscoveryCardActions(plan);
    postSyntheticMessage({
      avatarId: message.avatarId ?? actor,
      monitorTag: COMPLEX_TASK_PLANNER_TAG,
      content: `Could not load cast from Wikidata for **${workLabel}** (${workQid}). ${cast.notices.join(" ")} Try **Search again** or **None of these — use web search** on the work-pick card if it is still visible.`,
      actions: [
        {
          id: `search_discovery_again:${plan.planId}`,
          label: "Search again",
          payload: {
            plan,
            discoveryAttemptIndex: usedAttempt + 1,
          } satisfies CreateTasksPayload,
        },
        {
          id: `not_now:${plan.planId}`,
          label: "Skip",
          payload: { planId: plan.planId },
        },
      ],
      dedupKey: `wikidata_pick_err|${plan.planId}|${workQid}|${discoveryResultPostSeq++}`,
    });
    return;
  }

  const resolved: WikidataResolveResult = {
    workQid: workQid.trim(),
    workLabel,
    members: cast.members,
    notices: cast.notices,
  };
  const ks = wikidataResultToKnowledgeSet(plan, resolved);
  if (ks) upsertKnowledgeSetMergedLocal(ks);

  const normalizedSubjects = normalizeAvatarCreationSubjectNames(
    cast.members.map((m) => m.name)
  );
  if (normalizedSubjects.length === 0) {
    recordExcludedWikidataWorkQids(
      discoverySetKeyForPlan(plan),
      [workQid.trim()],
      buildSetPlatformTitle(plan)
    );
  }
  const detailLines = cast.members.map((m) => {
    const voice = m.actor ? ` (voice: ${m.actor})` : "";
    return `- ${m.name}${voice} (${m.qid})`;
  });
  const wdLike: Awaited<ReturnType<typeof populateSetFromWikidataForPlan>> = {
    subjectNames: normalizedSubjects,
    detailLines,
    notices: [
      ...cast.notices,
      cast.members.length >= MIN_WIKIDATA_CAST_ACCEPT
        ? "wikidata_resolved"
        : "wikidata_partial_roster",
    ],
    usedWikidata: true,
    partialRoster: cast.members.length < MIN_WIKIDATA_CAST_ACCEPT,
    workQidHint: workQid.trim(),
    workLabelHint: workLabel,
    successfulQuery: `${workLabel} (${workQid.trim()})`,
  };
  const resultForUi: Awaited<ReturnType<typeof discoverSetMembers>> = {
    names: normalizedSubjects,
    sourceLines: [
      "notice: wikidata_work_picked",
      "Cast (Wikidata P1441 / optional P725):",
      ...detailLines,
    ],
    notices: wdLike.notices,
  };
  await emitDiscoveryOutcome(message, plan, actor, usedAttempt, resultForUi, {
    wd: wdLike,
    legacyQuery,
    fromLegacy: false,
  });
}

function excludedWikidataWorkIdSetForPlan(plan: AvatarCreationPlan): Set<string> {
  const xs = getKnowledgeSet(discoverySetKeyForPlan(plan))?.excludedWikidataWorkQids ?? [];
  return new Set(xs.map((x) => x.toUpperCase()));
}

/** Empty cast from Wikidata that is safe to blacklist (not transport/SPARQL failure). */
function shouldPersistExcludedWorkPick(cast: {
  members: readonly unknown[];
  notices: readonly string[];
}): boolean {
  if (cast.members.length > 0) return false;
  const n = cast.notices;
  return !(
    n.includes("wikidata_sparql_error") ||
    n.includes("wikidata_sparql_unavailable") ||
    n.includes("work_qid_invalid")
  );
}

/**
 * Drop already-excluded works, then resolve cast for top candidates and exclude empty rosters
 * before showing the work-pick card (bounded SPARQL up to 5).
 */
async function prefetchFilterRankedWikidataWorks(
  plan: AvatarCreationPlan,
  ranked: WikidataSearchEntity[],
  primarySeed: string
): Promise<WikidataSearchEntity[]> {
  const setKey = discoverySetKeyForPlan(plan);
  const labelFb = buildSetPlatformTitle(plan);
  let excluded = excludedWikidataWorkIdSetForPlan(plan);
  let working = ranked.filter((e) => {
    const n = normalizeWikidataWorkQidForExclude(e.id);
    return n && !excluded.has(n);
  });

  const prefetchSlice = working.slice(0, 5);
  const newlyExcluded: string[] = [];
  for (const e of prefetchSlice) {
    const cast = await resolveCastForWork(e.id.trim());
    if (shouldPersistExcludedWorkPick(cast)) {
      const n = normalizeWikidataWorkQidForExclude(e.id);
      if (n) newlyExcluded.push(n);
    }
  }
  if (newlyExcluded.length > 0) {
    recordExcludedWikidataWorkQids(setKey, newlyExcluded, labelFb);
    excluded = excludedWikidataWorkIdSetForPlan(plan);
    working = ranked.filter((e) => {
      const n = normalizeWikidataWorkQidForExclude(e.id);
      return n && !excluded.has(n);
    });
  }

  contractLog(
    COMPLEX_TASK_PLANNER_MONITOR_NAME,
    "wikidata_work_prefilter",
    `seed=${primarySeed.slice(0, 120)} before=${ranked.length} after=${working.length}`,
    { level: "info" }
  );
  return working;
}

async function handlePickWikidataNoneWeb(
  message: ConversationMessage,
  payload: unknown
): Promise<void> {
  if (!isCreateTasksPayload(payload)) return;
  const actor = resolveAvatarCreationToolOwnerId(getAvatarCatalogSnapshot());
  const plan = payload.plan;
  const usedAttempt =
    typeof payload.discoveryAttemptIndex === "number"
      ? payload.discoveryAttemptIndex
      : 0;
  const discoveryQueries = discoveryQueriesForPlan(plan);
  const legacyQuery =
    discoveryQueries[usedAttempt % discoveryQueries.length] ??
    plan.discoveryQuery ??
    plan.originalRequest;
  const result = await discoverSetMembers(legacyQuery);
  await emitDiscoveryOutcome(message, plan, actor, usedAttempt, result, {
    legacySearchQueryUsed: legacyQuery,
    legacyQuery,
    fromLegacy: true,
  });
}

async function postWorkPickCard(
  message: ConversationMessage,
  plan: AvatarCreationPlan,
  actor: string,
  usedAttempt: number,
  ranked: WikidataSearchEntity[],
  rankNotices: readonly string[],
  primarySeed: string
): Promise<void> {
  registerSetDiscoveryCardActions(plan);
  const ambiguousNote = rankNotices.includes("wikidata_ambiguous_top2")
    ? "The top Wikidata matches were very close in score — choose the entry you meant.\n\n"
    : "";
  const body = `CHOOSE THE SOURCE
─────────────────

We looked up "${primarySeed}" in Wikidata but did not get a confident full cast list. Use the buttons below to choose the catalog entry (TV series, film, game, etc.) that defines this set. If none match, use "None of these — use web search" for unstructured results (noisier than Wikidata).

${ambiguousNote}`;

  const actions: MonitorAction[] = [];
  for (const e of ranked.slice(0, 5)) {
    const id = `pick_wikidata_work:${plan.planId}:${e.id}`;
    registerSyntheticAction(COMPLEX_TASK_PLANNER_TAG, id, ({ message: m, action }) =>
      handlePickWikidataWork(m, action.payload)
    );
    const desc = e.description?.trim();
    const hint = desc ? `${e.id} — ${desc}` : e.id;
    const label =
      e.label.length > 44 ? `${e.label.slice(0, 42)}…` : e.label;
    actions.push({
      id,
      label,
      hint,
      payload: {
        plan,
        workQid: e.id,
        workLabel: e.label,
        subjects: [],
        discoveryAttemptIndex: usedAttempt,
      } satisfies PickWorkPayload,
    });
  }

  const noneId = `pick_wikidata_none_web:${plan.planId}`;
  registerSyntheticAction(COMPLEX_TASK_PLANNER_TAG, noneId, ({ message: m, action }) =>
    handlePickWikidataNoneWeb(m, action.payload)
  );
  actions.push({
    id: noneId,
    label: "None of these — use web search",
    hint: "Heuristic names from web snippets (same as automatic fallback).",
    payload: {
      plan,
      subjects: [],
      discoveryAttemptIndex: usedAttempt,
    } satisfies CreateTasksPayload,
  });

  actions.push({
    id: `search_discovery_again:${plan.planId}`,
    label: "Search again",
    payload: {
      plan,
      discoveryAttemptIndex: usedAttempt + 1,
    } satisfies CreateTasksPayload,
  });
  actions.push({
    id: `done_building_set:${plan.planId}`,
    label: "Done building set",
    payload: { plan, subjects: [] } satisfies CreateTasksPayload,
  });
  actions.push({
    id: `not_now:${plan.planId}`,
    label: "Skip",
    payload: { planId: plan.planId },
  });

  const actionsWithOllama = await maybeAugmentActionsWithOllamaSuggest(
    actions,
    plan,
    usedAttempt
  );

  postSyntheticMessage({
    avatarId: message.avatarId ?? actor,
    monitorTag: COMPLEX_TASK_PLANNER_TAG,
    content: body,
    actions: actionsWithOllama,
    dedupKey: `wikidata_work_pick|${plan.planId}|${usedAttempt}|${discoveryResultPostSeq++}`,
  });
}

/** After Wikidata misses a confident roster, try Ollama once before legacy web search. */
async function discoverSetMembersWithOllamaBeforeLegacy(
  plan: AvatarCreationPlan,
  legacyQuery: string,
  primarySeed: string
): Promise<{
  result: Awaited<ReturnType<typeof discoverSetMembers>>;
  legacySearchQueryUsed?: string;
  fromLegacy: boolean;
  fromOllama: boolean;
}> {
  if ((await getOllamaPresence()) === "ready") {
    const ollamaRes = await suggestSetMembersWithOllama(plan, { seed: primarySeed });
    if (ollamaRes.notices.includes("ollama_suggested") && ollamaRes.names.length > 0) {
      return {
        result: {
          ...ollamaRes,
          names: normalizeAvatarCreationSubjectNames(ollamaRes.names),
        },
        fromLegacy: false,
        fromOllama: true,
      };
    }
  }
  const result = await discoverSetMembers(legacyQuery);
  return {
    result,
    legacySearchQueryUsed: legacyQuery,
    fromLegacy: true,
    fromOllama: false,
  };
}

async function handleSearchMembersAsync(
  message: ConversationMessage,
  payload: unknown
): Promise<void> {
  if (!isCreateTasksPayload(payload)) return;
  const catalog = getAvatarCatalogSnapshot();
  const actor = resolveAvatarCreationToolOwnerId(catalog);
  const plan = payload.plan;
  const usedAttempt =
    typeof payload.discoveryAttemptIndex === "number"
      ? payload.discoveryAttemptIndex
      : 0;
  const discoveryQueries = discoveryQueriesForPlan(plan);
  const legacyQuery =
    discoveryQueries[usedAttempt % discoveryQueries.length] ??
    plan.discoveryQuery ??
    plan.originalRequest;

  contractLog(
    COMPLEX_TASK_PLANNER_MONITOR_NAME,
    "discovery_started",
    `legacyQuery=${legacyQuery.slice(0, 400)} attempt=${usedAttempt}`,
    { level: "info" }
  );

  const primarySeed = (
    discoveryQueries[0] ??
    plan.discoveryQuery ??
    plan.originalRequest
  ).trim();

  try {
    let result: Awaited<ReturnType<typeof discoverSetMembers>>;
    let legacySearchQueryUsed: string | undefined;
    let wd: Awaited<ReturnType<typeof populateSetFromWikidataForPlan>> | undefined;
    let fromLegacy = false;
    let fromOllama = false;

    if (!forceLegacyDiscovery()) {
      wd = await populateSetFromWikidataForPlan(plan);
      if (wd.usedWikidata && wd.subjectNames.length > 0) {
        const normalizedSubjects = normalizeAvatarCreationSubjectNames(
          wd.subjectNames
        );
        result = {
          names: normalizedSubjects,
          sourceLines: [
            "notice: wikidata_resolved",
            "Cast (Wikidata P1441 / optional P725):",
            ...wd.detailLines,
          ],
          notices: wd.notices,
        };
      } else {
        const { ranked, notices: rankSearchNotices } =
          await searchRankedWorks(primarySeed);
        const filteredRanked = await prefetchFilterRankedWikidataWorks(
          plan,
          ranked,
          primarySeed
        );
        const offerPick =
          filteredRanked.length >= 2 ||
          (filteredRanked.length >= 1 &&
            rankSearchNotices.includes("wikidata_ambiguous_top2"));
        if (offerPick) {
          await postWorkPickCard(
            message,
            plan,
            actor,
            usedAttempt,
            filteredRanked,
            rankSearchNotices,
            primarySeed
          );
          return;
        }
        const picked = await discoverSetMembersWithOllamaBeforeLegacy(
          plan,
          legacyQuery,
          primarySeed
        );
        result = picked.result;
        legacySearchQueryUsed = picked.legacySearchQueryUsed;
        fromLegacy = picked.fromLegacy;
        fromOllama = picked.fromOllama;
      }
    } else {
      const picked = await discoverSetMembersWithOllamaBeforeLegacy(
        plan,
        legacyQuery,
        primarySeed
      );
      result = picked.result;
      legacySearchQueryUsed = picked.legacySearchQueryUsed;
      fromLegacy = picked.fromLegacy;
      fromOllama = picked.fromOllama;
    }

    await emitDiscoveryOutcome(message, plan, actor, usedAttempt, result, {
      wd,
      legacySearchQueryUsed,
      legacyQuery,
      fromLegacy,
      fromOllama,
      ollamaSeedForRun: fromOllama ? primarySeed : undefined,
    });
  } catch (err) {
    contractLog(
      COMPLEX_TASK_PLANNER_MONITOR_NAME,
      "discovery_failed",
      err instanceof Error ? err.message : String(err),
      { level: "warn" }
    );
    registerSyntheticAction(
      COMPLEX_TASK_PLANNER_TAG,
      `search_discovery_again:${plan.planId}`,
      async ({ message: m, action }) => {
        const pl = action.payload as CreateTasksPayload | undefined;
        if (!pl?.plan) return;
        await handleSearchMembersAsync(m, pl);
      }
    );
    postSyntheticMessage({
      avatarId: message.avatarId ?? actor,
      monitorTag: COMPLEX_TASK_PLANNER_TAG,
      content:
        "Member discovery hit an error. Try **Search again**, or use **Workshops → Creation**.",
      actions: [
        {
          id: `search_discovery_again:${plan.planId}`,
          label: "Search again",
          payload: {
            plan,
            discoveryAttemptIndex: usedAttempt + 1,
          } satisfies CreateTasksPayload,
        },
        {
          id: `not_now:${plan.planId}`,
          label: "Skip",
          payload: { planId: plan.planId },
        },
      ],
      dedupKey: `discovery_error|${plan.planId}|${discoveryResultPostSeq++}`,
    });
  }
}

export function installComplexTaskPlannerDynamicActions(planId: string): void {
  registerSyntheticAction(
    COMPLEX_TASK_PLANNER_TAG,
    `create_avatar_tasks:${planId}`,
    ({ message, action }) => handleCreateAvatarTasks(message, action.payload)
  );
  registerSyntheticAction(
    COMPLEX_TASK_PLANNER_TAG,
    `edit_named_list:${planId}`,
    ({ message, action }) => handleEditNamedList(message, action.payload)
  );
  registerSyntheticAction(
    COMPLEX_TASK_PLANNER_TAG,
    `search_members:${planId}`,
    ({ message, action }) => handleSearchMembersAsync(message, action.payload)
  );
  registerSyntheticAction(COMPLEX_TASK_PLANNER_TAG, `not_now:${planId}`, () => {
    /* User kept the review card without creating tasks. */
  });
}
