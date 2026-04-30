/**
 * Platform project & task store — durable on-disk state under
 * `%LOCALAPPDATA%/avatars/data/platform/platform_store.json`.
 * Uses the same allowlisted `platform_cache_*` Tauri commands as the source
 * caches (see `src-tauri/src/platform_cache.rs`).
 *
 * Ownership semantics:
 * - The *user* authors projects; `authorUserId` is always the local user.
 * - An avatar may *steward* a project (`ownerAvatarId`); the platform
 *   attribution id is never an eligible owner — it only administers.
 * - Every mutation appends to `history` so debugging ("who changed what
 *   when?") stays possible without a separate audit log.
 */

import {
  PLATFORM_ATTRIBUTION_AVATAR_ID,
  PLATFORM_STORE_FILE,
  PLATFORM_STORE_STORAGE_KEY,
  PLATFORM_STORE_SCHEMA_VERSION,
} from "./constants";
import { platformLog } from "./platformLog";
import { isSystemAvatarId } from "./routing";
import { isPlaceholderProjectTitle } from "../worldMetadata/titleSanity";
import { emitSessionChangeDelta } from "../sessionChangeTelemetry";

export type PlatformProjectStatus =
  | "active"
  | "paused"
  | "done"
  | "archived";

export type PlatformTaskStatus =
  | "open"
  | "snoozed"
  | "done"
  | "cancelled";

export type PlatformWorkflowStatus =
  | "open"
  | "ready"
  | "in_progress"
  | "blocked"
  | "waiting_for_user"
  | "waiting_for_approval"
  | "done"
  | "cancelled";

export type PlatformWorkflowNextActor =
  | "avatar"
  | "user"
  | "platform"
  | "external";

export type PlatformRequiredCapability = {
  id: string;
  kind?: "tool" | "source" | "permission" | "human" | "unknown";
  label?: string;
  reason?: string;
};

export type PlatformApprovalStatus =
  | "not_required"
  | "pending"
  | "approved"
  | "rejected";

export type PlatformApprovalPolicy =
  | "autonomous_local"
  | "user_approval_required"
  | "external_approval_required";

export type PlatformTaskApproval = {
  status: PlatformApprovalStatus;
  policy: PlatformApprovalPolicy;
  requestedAt?: number;
  requestedBy?: string;
  decidedAt?: number;
  decidedBy?: string;
  rationale?: string;
};

export type PlatformTaskBlocker = {
  id: string;
  title: string;
  detail?: string;
  createdAt: number;
  createdBy: string;
  resolvedAt?: number;
  resolvedBy?: string;
  resolution?: string;
};

export type PlatformTaskCompletionEvidence = {
  id: string;
  note: string;
  recordedAt: number;
  recordedBy: string;
  sourceRef?: string;
};

export type PlatformHistoryKind =
  | "created"
  | "updated"
  | "status_change"
  | "owner_change"
  | "note"
  | "migration"
  | "workflow_change"
  | "approval_change"
  | "blocker_change"
  | "completion_evidence";

export type PlatformHistoryEvent = {
  ts: number;
  kind: PlatformHistoryKind;
  /** Who caused the change. "user" for the human, avatarId for an avatar, or the platform scheduler (`PLATFORM_ATTRIBUTION_AVATAR_ID`). */
  actor: string;
  detail?: string;
};

export type PlatformProjectRecord = {
  id: string;
  title: string;
  summary?: string;
  status: PlatformProjectStatus;
  workflowStatus?: PlatformWorkflowStatus;
  nextActor?: PlatformWorkflowNextActor;
  requiredCapability?: PlatformRequiredCapability;
  blockers?: PlatformTaskBlocker[];
  completionEvidence?: PlatformTaskCompletionEvidence[];
  /** Singleton user id until multi-user is introduced. */
  authorUserId: "user";
  /** Avatar that stewards the project. Undefined until explicitly assigned. */
  ownerAvatarId?: string;
  createdAt: number;
  updatedAt: number;
  /** Scheduled deadline or next review (ms since epoch). */
  dueAt?: number;
  /** Hide from scheduler tick until this timestamp. */
  snoozedUntil?: number;
  history: PlatformHistoryEvent[];
};

export type PlatformTaskRecord = {
  id: string;
  projectId: string;
  title: string;
  notes?: string;
  status: PlatformTaskStatus;
  workflowStatus?: PlatformWorkflowStatus;
  nextActor?: PlatformWorkflowNextActor;
  requiredCapability?: PlatformRequiredCapability;
  approval?: PlatformTaskApproval;
  blockers?: PlatformTaskBlocker[];
  completionEvidence?: PlatformTaskCompletionEvidence[];
  createdAt: number;
  updatedAt: number;
  dueAt?: number;
  snoozedUntil?: number;
  ownerAvatarId?: string;
  history: PlatformHistoryEvent[];
};

export type PlatformStoreDoc = {
  schemaVersion: typeof PLATFORM_STORE_SCHEMA_VERSION;
  projects: Record<string, PlatformProjectRecord>;
  tasks: Record<string, PlatformTaskRecord>;
  migrations: {
    /** ms when world-metadata projects were imported. Undefined = not run. */
    fromWorldMetadataAt?: number;
    /** ms when browser-fallback localStorage was lifted to disk. */
    fromLocalStorageAt?: number;
  };
};

export function createEmptyPlatformStoreDoc(): PlatformStoreDoc {
  return {
    schemaVersion: PLATFORM_STORE_SCHEMA_VERSION,
    projects: {},
    tasks: {},
    migrations: {},
  };
}

/** -------------------------- in-memory singleton -------------------------- */

let doc: PlatformStoreDoc = createEmptyPlatformStoreDoc();
let loaded = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_DEBOUNCE_MS = 200;
const listeners = new Set<() => void>();

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

function getLocalStorage(): Storage | null {
  if (typeof globalThis === "undefined") return null;
  const ls = (globalThis as { localStorage?: Storage }).localStorage;
  return ls ?? null;
}

type RawPlatformStoreDoc = Omit<PlatformStoreDoc, "schemaVersion"> & {
  schemaVersion?: number;
};

function workflowFromTaskStatus(status: PlatformTaskStatus): PlatformWorkflowStatus {
  if (status === "done") return "done";
  if (status === "cancelled") return "cancelled";
  return "open";
}

function taskStatusFromWorkflow(
  workflowStatus: PlatformWorkflowStatus
): PlatformTaskStatus {
  if (workflowStatus === "done") return "done";
  if (workflowStatus === "cancelled") return "cancelled";
  return "open";
}

function workflowFromProjectStatus(
  status: PlatformProjectStatus
): PlatformWorkflowStatus {
  if (status === "done") return "done";
  if (status === "archived") return "cancelled";
  return "open";
}

function normalizeProjectRecord(
  rec: PlatformProjectRecord
): PlatformProjectRecord {
  return {
    ...rec,
    workflowStatus: rec.workflowStatus ?? workflowFromProjectStatus(rec.status),
  };
}

function normalizeTaskRecord(rec: PlatformTaskRecord): PlatformTaskRecord {
  return {
    ...rec,
    workflowStatus: rec.workflowStatus ?? workflowFromTaskStatus(rec.status),
  };
}

function migrateStoreDoc(raw: RawPlatformStoreDoc): PlatformStoreDoc {
  const projects: Record<string, PlatformProjectRecord> = {};
  for (const [id, rec] of Object.entries(raw.projects ?? {})) {
    projects[id] = normalizeProjectRecord(rec);
  }
  const tasks: Record<string, PlatformTaskRecord> = {};
  for (const [id, rec] of Object.entries(raw.tasks ?? {})) {
    tasks[id] = normalizeTaskRecord(rec);
  }
  return {
    schemaVersion: PLATFORM_STORE_SCHEMA_VERSION,
    projects,
    tasks,
    migrations: raw.migrations ?? {},
  };
}

function validateDoc(raw: unknown): PlatformStoreDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== PLATFORM_STORE_SCHEMA_VERSION && o.schemaVersion !== 1) {
    return null;
  }
  if (!o.projects || typeof o.projects !== "object") return null;
  if (!o.tasks || typeof o.tasks !== "object") return null;
  if (!o.migrations || typeof o.migrations !== "object") return null;
  return migrateStoreDoc(o as unknown as RawPlatformStoreDoc);
}

async function readFromDisk(): Promise<PlatformStoreDoc | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<string | null>("platform_cache_read", {
      filename: PLATFORM_STORE_FILE,
    });
    if (!raw) return null;
    return validateDoc(JSON.parse(raw));
  } catch (e) {
    platformLog("store_read_failed", "disk read failed", {
      level: "warn",
      detail: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

function readFromStorage(): PlatformStoreDoc | null {
  const ls = getLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(PLATFORM_STORE_STORAGE_KEY);
    if (!raw) return null;
    return validateDoc(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeToDisk(payload: string): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("platform_cache_write", {
      filename: PLATFORM_STORE_FILE,
      payload,
    });
    return true;
  } catch (e) {
    platformLog("store_read_failed", "disk write failed", {
      level: "error",
      detail: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

function writeToStorage(payload: string): void {
  const ls = getLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(PLATFORM_STORE_STORAGE_KEY, payload);
  } catch {
    /* quota ignored — next tick will retry */
  }
}

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch (e) {
      console.error("[platform store] listener threw", e);
    }
  }
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const payload = JSON.stringify(doc);
    writeToStorage(payload);
    void writeToDisk(payload).then((ok) => {
      if (ok) {
        platformLog("store_write", `${Object.keys(doc.projects).length} projects`, {
          level: "info",
        });
      }
    });
  }, PERSIST_DEBOUNCE_MS);
}

/** ------------------------------ public api ------------------------------ */

/**
 * Synchronous best-effort load from localStorage. First entry point — call on
 * app mount. Disk hydration happens in `ensurePlatformStoreLoadedAsync`.
 */
export function ensurePlatformStoreLoadedSync(): void {
  if (loaded) return;
  const fromStorage = readFromStorage();
  doc = fromStorage ?? createEmptyPlatformStoreDoc();
  loaded = true;
}

/**
 * Async load from disk (preferred in Tauri). Idempotent — safe to call on
 * every mount. When disk differs from localStorage the disk copy wins.
 */
export async function ensurePlatformStoreLoadedAsync(): Promise<void> {
  const disk = await readFromDisk();
  if (disk) {
    doc = disk;
    loaded = true;
    /** Mirror to localStorage so the next sync boot matches disk. */
    writeToStorage(JSON.stringify(doc));
    notify();
    return;
  }
  ensurePlatformStoreLoadedSync();
}

export function getPlatformStore(): PlatformStoreDoc {
  if (!loaded) ensurePlatformStoreLoadedSync();
  return doc;
}

export function subscribePlatformStore(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Test-only reset so unit tests can start fresh. */
export function __resetPlatformStoreForTests(): void {
  doc = createEmptyPlatformStoreDoc();
  loaded = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  listeners.clear();
}

/** -------------------------- mutation helpers --------------------------- */

function rejectIfSystemAvatar(actor: string): void {
  if (isSystemAvatarId(actor)) return; /* system avatars may act */
}

function now(): number {
  return Date.now();
}

function appendHistory(
  history: PlatformHistoryEvent[],
  event: PlatformHistoryEvent
): PlatformHistoryEvent[] {
  /** Cap history to avoid unbounded growth; recent tail matters most. */
  const MAX = 128;
  const next = [...history, event];
  if (next.length > MAX) return next.slice(next.length - MAX);
  return next;
}

function reconcileProjectStatusFromTasks(projectId: string, actor: string): void {
  const project = doc.projects[projectId];
  if (!project) return;
  const projectTasks = Object.values(doc.tasks).filter((t) => t.projectId === projectId);
  if (projectTasks.length === 0) return;
  const hasUnresolved = projectTasks.some(
    (t) => t.status !== "done" && t.status !== "cancelled"
  );
  const shouldBeDone = !hasUnresolved;
  const nextStatus: PlatformProjectStatus = shouldBeDone ? "done" : "active";
  const nextWorkflow: PlatformWorkflowStatus = shouldBeDone ? "done" : "open";
  if (project.status === nextStatus && (project.workflowStatus ?? "open") === nextWorkflow) {
    return;
  }
  const nowTs = now();
  let history = project.history ? [...project.history] : [];
  if (project.status !== nextStatus) {
    history = appendHistory(history, {
      ts: nowTs,
      actor,
      kind: "status_change",
      detail: `${project.status} -> ${nextStatus} (task reconciliation)`,
    });
  }
  if ((project.workflowStatus ?? "open") !== nextWorkflow) {
    history = appendHistory(history, {
      ts: nowTs,
      actor,
      kind: "workflow_change",
      detail: `${project.workflowStatus ?? "open"} -> ${nextWorkflow} (task reconciliation)`,
    });
  }
  doc = {
    ...doc,
    projects: {
      ...doc.projects,
      [projectId]: {
        ...project,
        status: nextStatus,
        workflowStatus: nextWorkflow,
        updatedAt: nowTs,
        history,
      },
    },
  };
  emitSessionChangeDelta(1);
}

function platformProjectCoreSig(p: PlatformProjectRecord): string {
  return JSON.stringify({
    title: p.title,
    summary: p.summary ?? "",
    status: p.status,
    workflowStatus: p.workflowStatus ?? workflowFromProjectStatus(p.status),
    ownerAvatarId: p.ownerAvatarId ?? "",
    dueAt: p.dueAt ?? null,
    snoozedUntil: p.snoozedUntil ?? null,
    nextActor: p.nextActor ?? "",
    requiredCapability: p.requiredCapability ?? "",
    blockers: p.blockers ?? [],
    completionEvidence: p.completionEvidence ?? [],
  });
}

function platformTaskCoreSig(p: PlatformTaskRecord): string {
  return JSON.stringify({
    title: p.title,
    notes: p.notes ?? "",
    projectId: p.projectId,
    status: p.status,
    workflowStatus: p.workflowStatus ?? workflowFromTaskStatus(p.status),
    ownerAvatarId: p.ownerAvatarId ?? "",
    dueAt: p.dueAt ?? null,
    snoozedUntil: p.snoozedUntil ?? null,
    nextActor: p.nextActor ?? "",
    requiredCapability: p.requiredCapability ?? "",
    approval: p.approval ?? null,
    blockers: p.blockers ?? [],
    completionEvidence: p.completionEvidence ?? [],
  });
}

export type UpsertProjectInput = {
  id?: string;
  title: string;
  /** Pass null to clear an existing summary while preserving other lifecycle fields. */
  summary?: string | null;
  status?: PlatformProjectStatus;
  workflowStatus?: PlatformWorkflowStatus;
  nextActor?: PlatformWorkflowNextActor | null;
  requiredCapability?: PlatformRequiredCapability | null;
  blockers?: PlatformTaskBlocker[];
  completionEvidence?: PlatformTaskCompletionEvidence[];
  ownerAvatarId?: string;
  dueAt?: number;
  snoozedUntil?: number;
  actor: string;
};

function makeId(prefix: string): string {
  /** Prefer crypto.randomUUID; otherwise fall back to Date+Math for old envs. */
  const g = globalThis as {
    crypto?: { randomUUID?: () => string };
  };
  const uuid = g.crypto?.randomUUID?.() ?? `${now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid}`;
}

export function upsertProject(input: UpsertProjectInput): PlatformProjectRecord {
  if (!loaded) ensurePlatformStoreLoadedSync();
  rejectIfSystemAvatar(input.actor);
  const owner = input.ownerAvatarId;
  if (owner && isSystemAvatarId(owner)) {
    throw new Error(
      `Platform attribution avatar cannot steward projects; ownerAvatarId=${owner} is reserved.`
    );
  }
  const nowTs = now();
  const existing = input.id ? doc.projects[input.id] : undefined;
  const id = existing?.id ?? input.id ?? makeId("proj");
  const statusChanged =
    existing && input.status && existing.status !== input.status;
  const ownerChanged =
    existing && owner !== undefined && existing.ownerAvatarId !== owner;
  const incomingTitle = input.title.trim();
  /**
   * On *create*, refuse placeholder titles (e.g. "…", "...", "<title>") that
   * leak in when an LLM copies the tool-schema example verbatim. On update,
   * fall back to the existing row's real title so a partial patch that omits
   * the title does not overwrite it.
   */
  if (!existing && isPlaceholderProjectTitle(incomingTitle)) {
    throw new Error(
      `Refusing to create project with placeholder title "${input.title}". ` +
        `Provide a substantive title.`
    );
  }
  const title = incomingTitle || existing?.title || "Untitled";
  const summary =
    input.summary === null ? undefined : input.summary ?? existing?.summary;
  const record: PlatformProjectRecord = {
    id,
    title,
    summary,
    status: input.status ?? existing?.status ?? "active",
    workflowStatus:
      input.workflowStatus ??
      existing?.workflowStatus ??
      workflowFromProjectStatus(input.status ?? existing?.status ?? "active"),
    nextActor:
      input.nextActor === null ? undefined : input.nextActor ?? existing?.nextActor,
    requiredCapability:
      input.requiredCapability === null
        ? undefined
        : input.requiredCapability ?? existing?.requiredCapability,
    blockers: input.blockers ?? existing?.blockers,
    completionEvidence:
      input.completionEvidence ?? existing?.completionEvidence,
    authorUserId: "user",
    ownerAvatarId: owner ?? existing?.ownerAvatarId,
    createdAt: existing?.createdAt ?? nowTs,
    updatedAt: nowTs,
    dueAt: input.dueAt ?? existing?.dueAt,
    snoozedUntil: input.snoozedUntil ?? existing?.snoozedUntil,
    history: existing?.history ? [...existing.history] : [],
  };
  record.history = appendHistory(record.history, {
    ts: nowTs,
    actor: input.actor,
    kind: existing ? "updated" : "created",
    detail: existing ? undefined : `title="${title}"`,
  });
  if (statusChanged) {
    record.history = appendHistory(record.history, {
      ts: nowTs,
      actor: input.actor,
      kind: "status_change",
      detail: `${existing!.status} -> ${input.status}`,
    });
  }
  if (ownerChanged) {
    record.history = appendHistory(record.history, {
      ts: nowTs,
      actor: input.actor,
      kind: "owner_change",
      detail: `${existing!.ownerAvatarId ?? "none"} -> ${owner ?? "none"}`,
    });
  }
  if (
    existing &&
    input.workflowStatus &&
    existing.workflowStatus !== input.workflowStatus
  ) {
    record.history = appendHistory(record.history, {
      ts: nowTs,
      actor: input.actor,
      kind: "workflow_change",
      detail: `${existing.workflowStatus ?? workflowFromProjectStatus(existing.status)} -> ${input.workflowStatus}`,
    });
  }
  if (!existing || platformProjectCoreSig(existing) !== platformProjectCoreSig(record)) {
    emitSessionChangeDelta(1);
  }
  doc = { ...doc, projects: { ...doc.projects, [id]: record } };
  schedulePersist();
  notify();
  return record;
}

export function deleteProject(id: string, actor: string): void {
  if (!loaded) ensurePlatformStoreLoadedSync();
  if (!(id in doc.projects)) return;
  const { [id]: _removed, ...rest } = doc.projects;
  void _removed;
  /** Cascade delete all tasks belonging to this project. */
  const remainingTasks: Record<string, PlatformTaskRecord> = {};
  for (const [tid, t] of Object.entries(doc.tasks)) {
    if (t.projectId !== id) remainingTasks[tid] = t;
  }
  doc = { ...doc, projects: rest, tasks: remainingTasks };
  emitSessionChangeDelta(1);
  platformLog("store_write", `project ${id} deleted by ${actor}`, { level: "info" });
  schedulePersist();
  notify();
}

/**
 * Scan the platform store for projects whose title is a placeholder
 * ("…", "...", "<title>", "TBD", …) and delete them, cascading to tasks.
 * Returns the dropped ids. Safe to call every startup; idempotent once clean.
 */
export function prunePlatformPlaceholderProjects(): string[] {
  if (!loaded) ensurePlatformStoreLoadedSync();
  const dropped: string[] = [];
  for (const [id, rec] of Object.entries(doc.projects)) {
    if (isPlaceholderProjectTitle(rec.title)) dropped.push(id);
  }
  if (dropped.length === 0) return dropped;
  const nextProjects: Record<string, PlatformProjectRecord> = {};
  for (const [id, rec] of Object.entries(doc.projects)) {
    if (!dropped.includes(id)) nextProjects[id] = rec;
  }
  const nextTasks: Record<string, PlatformTaskRecord> = {};
  for (const [tid, t] of Object.entries(doc.tasks)) {
    if (!dropped.includes(t.projectId)) nextTasks[tid] = t;
  }
  doc = { ...doc, projects: nextProjects, tasks: nextTasks };
  platformLog(
    "store_write",
    `pruned ${dropped.length} placeholder project(s)`,
    { level: "info" }
  );
  schedulePersist();
  notify();
  return dropped;
}

export type UpsertTaskInput = {
  id?: string;
  projectId: string;
  title: string;
  notes?: string;
  status?: PlatformTaskStatus;
  workflowStatus?: PlatformWorkflowStatus;
  nextActor?: PlatformWorkflowNextActor | null;
  requiredCapability?: PlatformRequiredCapability | null;
  approval?: PlatformTaskApproval | null;
  blockers?: PlatformTaskBlocker[];
  completionEvidence?: PlatformTaskCompletionEvidence[];
  ownerAvatarId?: string;
  dueAt?: number;
  snoozedUntil?: number;
  actor: string;
};

export function upsertTask(input: UpsertTaskInput): PlatformTaskRecord {
  if (!loaded) ensurePlatformStoreLoadedSync();
  if (!doc.projects[input.projectId]) {
    throw new Error(`unknown projectId: ${input.projectId}`);
  }
  const owner = input.ownerAvatarId;
  if (owner && isSystemAvatarId(owner)) {
    throw new Error(
      `Platform attribution avatar cannot own tasks; ownerAvatarId=${owner} is reserved.`
    );
  }
  const nowTs = now();
  const existing = input.id ? doc.tasks[input.id] : undefined;
  const id = existing?.id ?? input.id ?? makeId("task");
  const workflowStatus =
    input.workflowStatus ??
    existing?.workflowStatus ??
    workflowFromTaskStatus(input.status ?? existing?.status ?? "open");
  const status =
    input.status ??
    (input.workflowStatus
      ? taskStatusFromWorkflow(workflowStatus)
      : existing?.status ?? taskStatusFromWorkflow(workflowStatus));
  const statusChanged =
    existing && status && existing.status !== status;
  const title = input.title.trim() || existing?.title || "Untitled task";
  const record: PlatformTaskRecord = {
    id,
    projectId: input.projectId,
    title,
    notes: input.notes ?? existing?.notes,
    status,
    workflowStatus,
    nextActor:
      input.nextActor === null ? undefined : input.nextActor ?? existing?.nextActor,
    requiredCapability:
      input.requiredCapability === null
        ? undefined
        : input.requiredCapability ?? existing?.requiredCapability,
    approval:
      input.approval === null ? undefined : input.approval ?? existing?.approval,
    blockers: input.blockers ?? existing?.blockers,
    completionEvidence:
      input.completionEvidence ?? existing?.completionEvidence,
    createdAt: existing?.createdAt ?? nowTs,
    updatedAt: nowTs,
    dueAt: input.dueAt ?? existing?.dueAt,
    snoozedUntil: input.snoozedUntil ?? existing?.snoozedUntil,
    ownerAvatarId: owner ?? existing?.ownerAvatarId,
    history: existing?.history ? [...existing.history] : [],
  };
  record.history = appendHistory(record.history, {
    ts: nowTs,
    actor: input.actor,
    kind: existing ? "updated" : "created",
    detail: existing ? undefined : `title="${title}"`,
  });
  if (statusChanged) {
    record.history = appendHistory(record.history, {
      ts: nowTs,
      actor: input.actor,
      kind: "status_change",
      detail: `${existing!.status} -> ${status}`,
    });
  }
  if (
    existing &&
    input.workflowStatus &&
    existing.workflowStatus !== input.workflowStatus
  ) {
    record.history = appendHistory(record.history, {
      ts: nowTs,
      actor: input.actor,
      kind: "workflow_change",
      detail: `${existing.workflowStatus ?? workflowFromTaskStatus(existing.status)} -> ${input.workflowStatus}`,
    });
  }
  if (!existing || platformTaskCoreSig(existing) !== platformTaskCoreSig(record)) {
    emitSessionChangeDelta(1);
  }
  doc = { ...doc, tasks: { ...doc.tasks, [id]: record } };
  reconcileProjectStatusFromTasks(record.projectId, input.actor);
  if (existing && existing.projectId !== record.projectId) {
    reconcileProjectStatusFromTasks(existing.projectId, input.actor);
  }
  schedulePersist();
  notify();
  return record;
}

export type UpdateTaskWorkflowInput = {
  taskId: string;
  actor: string;
  workflowStatus?: PlatformWorkflowStatus;
  nextActor?: PlatformWorkflowNextActor | null;
  requiredCapability?: PlatformRequiredCapability | null;
  approval?: PlatformTaskApproval | null;
  blockers?: PlatformTaskBlocker[];
  completionEvidence?: PlatformTaskCompletionEvidence[];
  detail?: string;
};

export function updateTaskWorkflow(
  input: UpdateTaskWorkflowInput
): PlatformTaskRecord {
  if (!loaded) ensurePlatformStoreLoadedSync();
  const existing = doc.tasks[input.taskId];
  if (!existing) throw new Error(`unknown taskId: ${input.taskId}`);

  const nowTs = now();
  const workflowStatus =
    input.workflowStatus ?? existing.workflowStatus ?? workflowFromTaskStatus(existing.status);
  let history = existing.history ? [...existing.history] : [];
  if (workflowStatus !== (existing.workflowStatus ?? workflowFromTaskStatus(existing.status))) {
    history = appendHistory(history, {
      ts: nowTs,
      actor: input.actor,
      kind: "workflow_change",
      detail:
        input.detail ??
        `${existing.workflowStatus ?? workflowFromTaskStatus(existing.status)} -> ${workflowStatus}`,
    });
  }
  if (input.approval !== undefined) {
    history = appendHistory(history, {
      ts: nowTs,
      actor: input.actor,
      kind: "approval_change",
      detail: input.approval
        ? `${input.approval.policy}:${input.approval.status}`
        : "cleared",
    });
  }
  if (input.blockers !== undefined) {
    history = appendHistory(history, {
      ts: nowTs,
      actor: input.actor,
      kind: "blocker_change",
      detail: `${input.blockers.length} blocker(s)`,
    });
  }
  if (input.completionEvidence !== undefined) {
    history = appendHistory(history, {
      ts: nowTs,
      actor: input.actor,
      kind: "completion_evidence",
      detail: `${input.completionEvidence.length} evidence item(s)`,
    });
  }

  const record: PlatformTaskRecord = {
    ...existing,
    status: input.workflowStatus
      ? taskStatusFromWorkflow(workflowStatus)
      : existing.status,
    workflowStatus,
    nextActor:
      input.nextActor === null ? undefined : input.nextActor ?? existing.nextActor,
    requiredCapability:
      input.requiredCapability === null
        ? undefined
        : input.requiredCapability ?? existing.requiredCapability,
    approval:
      input.approval === null ? undefined : input.approval ?? existing.approval,
    blockers: input.blockers ?? existing.blockers,
    completionEvidence:
      input.completionEvidence ?? existing.completionEvidence,
    updatedAt: nowTs,
    history,
  };
  if (platformTaskCoreSig(existing) !== platformTaskCoreSig(record)) {
    emitSessionChangeDelta(1);
  }
  doc = { ...doc, tasks: { ...doc.tasks, [record.id]: record } };
  reconcileProjectStatusFromTasks(record.projectId, input.actor);
  schedulePersist();
  notify();
  return record;
}

export function createTaskBlocker(
  actor: string,
  title: string,
  detail?: string
): PlatformTaskBlocker {
  return {
    id: makeId("blocker"),
    title,
    detail,
    createdAt: now(),
    createdBy: actor,
  };
}

export function createTaskCompletionEvidence(
  actor: string,
  note: string,
  sourceRef?: string
): PlatformTaskCompletionEvidence {
  return {
    id: makeId("evidence"),
    note,
    sourceRef,
    recordedAt: now(),
    recordedBy: actor,
  };
}

export function deleteTask(id: string, actor: string): void {
  if (!loaded) ensurePlatformStoreLoadedSync();
  const existing = doc.tasks[id];
  if (!existing) return;
  const { [id]: _removed, ...rest } = doc.tasks;
  void _removed;
  emitSessionChangeDelta(1);
  doc = { ...doc, tasks: rest };
  reconcileProjectStatusFromTasks(existing.projectId, actor);
  platformLog("store_write", `task ${id} deleted by ${actor}`, { level: "info" });
  schedulePersist();
  notify();
}

/** ------------------------- one-shot migration ------------------------- */

export type WorldProjectLike = {
  title: string;
  summary?: string;
  updatedAt?: number;
};

/**
 * Import world_metadata.projects into the platform store on first run only.
 * Idempotent — skipped once `migrations.fromWorldMetadataAt` is set.
 * Caller supplies the projects map so this module stays decoupled from
 * world_metadata (avoids a circular import).
 */
export function migrateProjectsFromWorldMetadata(
  worldProjects: Record<string, WorldProjectLike>
): { imported: number; skipped: number } {
  if (!loaded) ensurePlatformStoreLoadedSync();
  if (doc.migrations.fromWorldMetadataAt) {
    return { imported: 0, skipped: Object.keys(worldProjects).length };
  }
  const nowTs = now();
  const nextProjects: Record<string, PlatformProjectRecord> = { ...doc.projects };
  let imported = 0;
  for (const [wid, wp] of Object.entries(worldProjects)) {
    if (nextProjects[wid]) continue;
    nextProjects[wid] = {
      id: wid,
      title: wp.title,
      summary: wp.summary,
      status: "active",
      workflowStatus: "open",
      authorUserId: "user",
      createdAt: wp.updatedAt ?? nowTs,
      updatedAt: nowTs,
      history: [
        {
          ts: nowTs,
          actor: PLATFORM_ATTRIBUTION_AVATAR_ID,
          kind: "migration",
          detail: "imported from world_metadata",
        },
      ],
    };
    imported++;
  }
  doc = {
    ...doc,
    projects: nextProjects,
    migrations: { ...doc.migrations, fromWorldMetadataAt: nowTs },
  };
  if (imported > 0) {
    platformLog(
      "store_migrated",
      `imported ${imported} projects from world_metadata`,
      { level: "info" }
    );
  }
  schedulePersist();
  notify();
  return { imported, skipped: Object.keys(worldProjects).length - imported };
}

/**
 * Startup sync: import missing `worldProjects` entries and refresh authored
 * title / summary fields on existing platform rows, without touching lifecycle
 * fields (`status`, steward, due/snooze, task history). Unlike
 * `migrateProjectsFromWorldMetadata` this runs on every startup so seed
 * updates and world-metadata edits land in the platform store too.
 */
export function syncWorldMetadataProjectsAdditive(
  worldProjects: Record<string, WorldProjectLike>
): { added: number; updated: number } {
  if (!loaded) ensurePlatformStoreLoadedSync();
  const nowTs = now();
  let added = 0;
  let updated = 0;
  const nextProjects: Record<string, PlatformProjectRecord> = { ...doc.projects };
  for (const [wid, wp] of Object.entries(worldProjects)) {
    if (isPlaceholderProjectTitle(wp.title)) continue;
    const summary = wp.summary?.trim() || undefined;
    const existing = nextProjects[wid];
    if (existing) {
      const title = wp.title.trim();
      if (existing.title === title && existing.summary === summary) continue;
      nextProjects[wid] = {
        ...existing,
        title,
        summary,
        updatedAt: nowTs,
        history: appendHistory(existing.history, {
          ts: nowTs,
          actor: PLATFORM_ATTRIBUTION_AVATAR_ID,
          kind: "updated",
          detail: "synced title/summary from world_metadata",
        }),
      };
      updated++;
      continue;
    }
    nextProjects[wid] = {
      id: wid,
      title: wp.title.trim(),
      summary,
      status: "active",
      workflowStatus: "open",
      authorUserId: "user",
      createdAt: wp.updatedAt ?? nowTs,
      updatedAt: nowTs,
      history: [
        {
          ts: nowTs,
          actor: PLATFORM_ATTRIBUTION_AVATAR_ID,
          kind: "migration",
          detail: "additive sync from world_metadata",
        },
      ],
    };
    added++;
  }
  if (added === 0 && updated === 0) return { added: 0, updated: 0 };
  doc = { ...doc, projects: nextProjects };
  platformLog(
    "store_write",
    `world sync imported ${added} and updated ${updated} project(s) from world_metadata`,
    { level: "info" }
  );
  schedulePersist();
  notify();
  return { added, updated };
}
