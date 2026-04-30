/**
 * Platform drafts store — persists draft external actions (tasks, calendar
 * events, email replies) that await user approval. Draft-only: nothing in
 * this module sends email, creates calendar events upstream, or mutates any
 * connector. The user is the *only* path to real external writes.
 *
 * Persistence mirrors `store.ts`: allowlisted Tauri JSON file + localStorage
 * fallback. See `src-tauri/src/platform_cache.rs` for the disk allowlist.
 */

import {
  PLATFORM_DRAFTS_FILE,
  PLATFORM_DRAFTS_SCHEMA_VERSION,
  PLATFORM_DRAFTS_STORAGE_KEY,
} from "./constants";
import { platformLog } from "./platformLog";
import { emitSessionChangeDelta } from "../sessionChangeTelemetry";

export type PlatformDraftKind =
  | "task"
  | "calendar_event"
  | "email_reply";

export type PlatformDraftStatus = "pending" | "approved" | "discarded";

export type PlatformTaskDraftPayload = {
  kind: "task";
  projectId: string;
  title: string;
  notes?: string;
  dueAt?: number;
  ownerAvatarId?: string;
};

export type PlatformCalendarDraftPayload = {
  kind: "calendar_event";
  title: string;
  startAt: number;
  endAt?: number;
  notes?: string;
  attendees?: string[];
};

export type PlatformEmailDraftPayload = {
  kind: "email_reply";
  /** Thread / message being replied to. */
  inReplyToMessageId?: string;
  to: string[];
  cc?: string[];
  subject?: string;
  body: string;
};

export type PlatformDraftPayload =
  | PlatformTaskDraftPayload
  | PlatformCalendarDraftPayload
  | PlatformEmailDraftPayload;

export type PlatformDraftRecord = {
  id: string;
  kind: PlatformDraftKind;
  status: PlatformDraftStatus;
  /** Requesting avatar (chain of custody). */
  requestedByAvatarId: string;
  /** Optional user-turn context for traceability. */
  sourceUserMessageId?: string;
  createdAt: number;
  updatedAt: number;
  payload: PlatformDraftPayload;
  /** Non-binding rationale the requesting avatar left for the user. */
  rationale?: string;
};

export type PlatformDraftsDoc = {
  schemaVersion: typeof PLATFORM_DRAFTS_SCHEMA_VERSION;
  drafts: Record<string, PlatformDraftRecord>;
};

export function createEmptyPlatformDraftsDoc(): PlatformDraftsDoc {
  return { schemaVersion: PLATFORM_DRAFTS_SCHEMA_VERSION, drafts: {} };
}

let doc: PlatformDraftsDoc = createEmptyPlatformDraftsDoc();
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

function validateDoc(raw: unknown): PlatformDraftsDoc | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== PLATFORM_DRAFTS_SCHEMA_VERSION) return null;
  if (!o.drafts || typeof o.drafts !== "object") return null;
  return o as unknown as PlatformDraftsDoc;
}

async function readFromDisk(): Promise<PlatformDraftsDoc | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<string | null>("platform_cache_read", {
      filename: PLATFORM_DRAFTS_FILE,
    });
    if (!raw) return null;
    return validateDoc(JSON.parse(raw));
  } catch (e) {
    platformLog("drafts_read_failed", "disk read failed", {
      level: "warn",
      detail: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

function readFromStorage(): PlatformDraftsDoc | null {
  const ls = getLocalStorage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(PLATFORM_DRAFTS_STORAGE_KEY);
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
      filename: PLATFORM_DRAFTS_FILE,
      payload,
    });
    return true;
  } catch (e) {
    platformLog("drafts_read_failed", "disk write failed", {
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
    ls.setItem(PLATFORM_DRAFTS_STORAGE_KEY, payload);
  } catch {
    /* quota ignored */
  }
}

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch (e) {
      console.error("[platform drafts] listener threw", e);
    }
  }
}

function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const payload = JSON.stringify(doc);
    writeToStorage(payload);
    void writeToDisk(payload);
  }, PERSIST_DEBOUNCE_MS);
}

export function ensurePlatformDraftsLoadedSync(): void {
  if (loaded) return;
  const fromStorage = readFromStorage();
  doc = fromStorage ?? createEmptyPlatformDraftsDoc();
  loaded = true;
}

export async function ensurePlatformDraftsLoadedAsync(): Promise<void> {
  const disk = await readFromDisk();
  if (disk) {
    doc = disk;
    loaded = true;
    writeToStorage(JSON.stringify(doc));
    notify();
    return;
  }
  ensurePlatformDraftsLoadedSync();
}

export function getPlatformDrafts(): PlatformDraftsDoc {
  if (!loaded) ensurePlatformDraftsLoadedSync();
  return doc;
}

export function subscribePlatformDrafts(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function __resetPlatformDraftsForTests(): void {
  doc = createEmptyPlatformDraftsDoc();
  loaded = false;
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  listeners.clear();
}

function makeDraftId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  const uuid =
    g.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  return `draft_${uuid}`;
}

export type RecordDraftInput = {
  kind: PlatformDraftKind;
  requestedByAvatarId: string;
  sourceUserMessageId?: string;
  rationale?: string;
  payload: PlatformDraftPayload;
};

export function recordDraft(input: RecordDraftInput): PlatformDraftRecord {
  if (!loaded) ensurePlatformDraftsLoadedSync();
  if (input.payload.kind !== input.kind) {
    throw new Error(
      `drafts: payload.kind=${input.payload.kind} mismatches kind=${input.kind}`
    );
  }
  const now = Date.now();
  const id = makeDraftId();
  const rec: PlatformDraftRecord = {
    id,
    kind: input.kind,
    status: "pending",
    requestedByAvatarId: input.requestedByAvatarId,
    sourceUserMessageId: input.sourceUserMessageId,
    rationale: input.rationale,
    createdAt: now,
    updatedAt: now,
    payload: input.payload,
  };
  doc = { ...doc, drafts: { ...doc.drafts, [id]: rec } };
  emitSessionChangeDelta(1);
  platformLog("draft_recorded", `${input.kind} by ${input.requestedByAvatarId}`, {
    level: "info",
    detail: id,
  });
  schedulePersist();
  notify();
  return rec;
}

export function setDraftStatus(
  id: string,
  status: PlatformDraftStatus,
  actor: string
): PlatformDraftRecord | null {
  if (!loaded) ensurePlatformDraftsLoadedSync();
  const existing = doc.drafts[id];
  if (!existing) return null;
  if (existing.status === status) return existing;
  const updated: PlatformDraftRecord = {
    ...existing,
    status,
    updatedAt: Date.now(),
  };
  doc = { ...doc, drafts: { ...doc.drafts, [id]: updated } };
  emitSessionChangeDelta(1);
  platformLog("draft_status", `${id} -> ${status} by ${actor}`, { level: "info" });
  schedulePersist();
  notify();
  return updated;
}
