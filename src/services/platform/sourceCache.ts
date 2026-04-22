/**
 * Durable per-source cache for connector snapshots. Owned by the platform layer.
 *
 * Storage:
 * - Tauri: atomic JSON write under `%LOCALAPPDATA%/avatars/data/platform/`
 *   (see `src-tauri/src/platform_cache.rs`).
 * - Browser / tests: `localStorage` fallback so unit tests and dev without
 *   Tauri still exercise the cache-aware code paths.
 *
 * Callers should not assume the presence of a cache; `read` returns `null`
 * until a runner (Phase 1 follow-up todos) populates it.
 */

import type { CalendarEvent, Contact, EmailItem } from "../../connectors/types";
import {
  PLATFORM_CACHE_FILES,
  PLATFORM_CACHE_SCHEMA_VERSION,
  PLATFORM_CACHE_STORAGE_KEYS,
} from "./constants";
import { platformLog } from "./platformLog";

export type SourceCacheKind = "email" | "calendar" | "contacts";

export type SourceCacheItems = {
  email: EmailItem[];
  calendar: CalendarEvent[];
  contacts: Contact[];
};

export type SourceCacheSnapshot<K extends SourceCacheKind = SourceCacheKind> = {
  schemaVersion: typeof PLATFORM_CACHE_SCHEMA_VERSION;
  source: K;
  /** ms since epoch the runner finished the fetch-and-rank. */
  fetchedAt: number;
  /** Stable hash of item ids (not bodies); used for delta detection. */
  snapshotHash: string;
  /** Ordered raw connector rows — scoring is still applied per-turn. */
  items: SourceCacheItems[K];
  /** Ids of the runner's top-K at `fetchedAt`; used by wave delta emission. */
  topKIds: string[];
};

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

function getLocalStorage(): Storage | null {
  if (typeof globalThis === "undefined") return null;
  const ls = (globalThis as { localStorage?: Storage }).localStorage;
  return ls ?? null;
}

function cacheFileName(kind: SourceCacheKind): string {
  return PLATFORM_CACHE_FILES[kind];
}

function cacheStorageKey(kind: SourceCacheKind): string {
  return PLATFORM_CACHE_STORAGE_KEYS[kind];
}

function validateSnapshot<K extends SourceCacheKind>(
  raw: unknown,
  kind: K
): SourceCacheSnapshot<K> | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== PLATFORM_CACHE_SCHEMA_VERSION) return null;
  if (o.source !== kind) return null;
  if (typeof o.fetchedAt !== "number") return null;
  if (typeof o.snapshotHash !== "string") return null;
  if (!Array.isArray(o.items)) return null;
  if (!Array.isArray(o.topKIds)) return null;
  return o as unknown as SourceCacheSnapshot<K>;
}

async function readFromDisk(kind: SourceCacheKind): Promise<string | null> {
  if (!isTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const raw = await invoke<string | null>("platform_cache_read", {
      filename: cacheFileName(kind),
    });
    return typeof raw === "string" && raw.length > 0 ? raw : null;
  } catch (e) {
    platformLog("cache_miss", `disk read failed for ${kind}`, {
      level: "warn",
      detail: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

async function writeToDisk(
  kind: SourceCacheKind,
  payload: string
): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("platform_cache_write", {
      filename: cacheFileName(kind),
      payload,
    });
    return true;
  } catch (e) {
    platformLog("cache_write_failed", `disk write failed for ${kind}`, {
      level: "error",
      detail: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}

function readFromStorage(kind: SourceCacheKind): string | null {
  const ls = getLocalStorage();
  if (!ls) return null;
  try {
    return ls.getItem(cacheStorageKey(kind));
  } catch {
    return null;
  }
}

function writeToStorage(kind: SourceCacheKind, payload: string): void {
  const ls = getLocalStorage();
  if (!ls) return;
  try {
    ls.setItem(cacheStorageKey(kind), payload);
  } catch {
    /* quota or unavailable — surface as cache_write_failed below */
    platformLog(
      "cache_write_failed",
      `localStorage write failed for ${kind}`,
      { level: "warn" }
    );
  }
}

/** Read the latest snapshot for `kind`, or `null` when no runner has written one yet. */
export async function readSourceCache<K extends SourceCacheKind>(
  kind: K
): Promise<SourceCacheSnapshot<K> | null> {
  const disk = await readFromDisk(kind);
  const raw = disk ?? readFromStorage(kind);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const valid = validateSnapshot(parsed, kind);
    if (!valid) {
      platformLog("cache_miss", `invalid cache payload for ${kind}`, {
        level: "warn",
      });
      return null;
    }
    return valid;
  } catch (e) {
    platformLog("cache_miss", `cache JSON parse failed for ${kind}`, {
      level: "warn",
      detail: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/** Synchronous best-effort read (localStorage only); use for render-time cache age. */
export function readSourceCacheSync<K extends SourceCacheKind>(
  kind: K
): SourceCacheSnapshot<K> | null {
  const raw = readFromStorage(kind);
  if (!raw) return null;
  try {
    return validateSnapshot(JSON.parse(raw), kind);
  } catch {
    return null;
  }
}

export type WriteSourceCacheArgs<K extends SourceCacheKind> = {
  kind: K;
  items: SourceCacheItems[K];
  topKIds: string[];
  fetchedAt?: number;
};

/** Persist a snapshot. Disk write is atomic (temp + rename); localStorage mirrors for dev. */
export async function writeSourceCache<K extends SourceCacheKind>(
  args: WriteSourceCacheArgs<K>
): Promise<SourceCacheSnapshot<K>> {
  const snapshot: SourceCacheSnapshot<K> = {
    schemaVersion: PLATFORM_CACHE_SCHEMA_VERSION,
    source: args.kind,
    fetchedAt: args.fetchedAt ?? Date.now(),
    snapshotHash: hashItemIds(args.items),
    items: args.items,
    topKIds: [...args.topKIds],
  };
  const payload = JSON.stringify(snapshot);
  const diskOk = await writeToDisk(args.kind, payload);
  writeToStorage(args.kind, payload);
  platformLog(
    "cache_update",
    `${args.kind} snapshot (${args.items.length} items)`,
    {
      level: "info",
      detail: `disk=${diskOk ? "ok" : "skipped"} top=${snapshot.topKIds
        .slice(0, 3)
        .join(",")}`,
    }
  );
  return snapshot;
}

/** FNV-1a 32-bit over concatenated ids — deterministic, no crypto dep needed. */
export function hashItemIds(items: readonly { id: string }[]): string {
  let h = 2166136261;
  for (const it of items) {
    const s = it.id ?? "";
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= 0x2c; /* ',' separator */
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export type SourceCacheStaleness = {
  kind: SourceCacheKind;
  ageMs: number | null;
  present: boolean;
};

export function describeStaleness<K extends SourceCacheKind>(
  snapshot: SourceCacheSnapshot<K> | null,
  now: number = Date.now()
): SourceCacheStaleness {
  if (!snapshot) {
    return { kind: "email", ageMs: null, present: false };
  }
  return {
    kind: snapshot.source,
    ageMs: Math.max(0, now - snapshot.fetchedAt),
    present: true,
  };
}
