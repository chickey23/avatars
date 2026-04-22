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

export type PlatformHistoryKind =
  | "created"
  | "updated"
  | "status_change"
  | "owner_change"
  | "note"
  | "migration";

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

function validateDoc(raw: unknown): PlatformStoreDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== PLATFORM_STORE_SCHEMA_VERSION) return null;
  if (!o.projects || typeof o.projects !== "object") return null;
  if (!o.tasks || typeof o.tasks !== "object") return null;
  if (!o.migrations || typeof o.migrations !== "object") return null;
  return o as unknown as PlatformStoreDoc;
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

export type UpsertProjectInput = {
  id?: string;
  title: string;
  summary?: string;
  status?: PlatformProjectStatus;
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
  const record: PlatformProjectRecord = {
    id,
    title,
    summary: input.summary ?? existing?.summary,
    status: input.status ?? existing?.status ?? "active",
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
  const statusChanged =
    existing && input.status && existing.status !== input.status;
  const title = input.title.trim() || existing?.title || "Untitled task";
  const record: PlatformTaskRecord = {
    id,
    projectId: input.projectId,
    title,
    notes: input.notes ?? existing?.notes,
    status: input.status ?? existing?.status ?? "open",
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
      detail: `${existing!.status} -> ${input.status}`,
    });
  }
  doc = { ...doc, tasks: { ...doc.tasks, [id]: record } };
  schedulePersist();
  notify();
  return record;
}

export function deleteTask(id: string, actor: string): void {
  if (!loaded) ensurePlatformStoreLoadedSync();
  if (!(id in doc.tasks)) return;
  const { [id]: _removed, ...rest } = doc.tasks;
  void _removed;
  doc = { ...doc, tasks: rest };
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
 * Additive sync: import any `worldProjects` entries whose ids are not yet in
 * the platform store, without touching the one-shot migration stamp. Unlike
 * `migrateProjectsFromWorldMetadata` this runs on every startup so seed
 * updates (new entries appended to `PROJECT_SEED_LIST`) land in the platform
 * store too. Existing rows are left untouched; placeholder titles are
 * skipped so ghost entries cannot sneak in via the seed path.
 */
export function syncWorldMetadataProjectsAdditive(
  worldProjects: Record<string, WorldProjectLike>
): { added: number } {
  if (!loaded) ensurePlatformStoreLoadedSync();
  const nowTs = now();
  let added = 0;
  const nextProjects: Record<string, PlatformProjectRecord> = { ...doc.projects };
  for (const [wid, wp] of Object.entries(worldProjects)) {
    if (nextProjects[wid]) continue;
    if (isPlaceholderProjectTitle(wp.title)) continue;
    nextProjects[wid] = {
      id: wid,
      title: wp.title,
      summary: wp.summary,
      status: "active",
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
  if (added === 0) return { added: 0 };
  doc = { ...doc, projects: nextProjects };
  platformLog(
    "store_write",
    `additive sync imported ${added} project(s) from world_metadata`,
    { level: "info" }
  );
  schedulePersist();
  notify();
  return { added };
}
