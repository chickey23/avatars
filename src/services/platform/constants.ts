/**
 * Platform — background runners, durable JSON caches, scheduler, write-tool drafts.
 *
 * Durable string contract (Tauri on-disk tree, `invoke` command names, session-log
 * namespace, localStorage keys) is **defined here**; see
 * [docs/PLATFORM_PERSISTENCE.md](../../../docs/PLATFORM_PERSISTENCE.md) for a summary table.
 */

/**
 * Default avatar id used for platform attribution and accent when that row
 * exists in the catalog. Prefer `resolvePlatformAttributionFromCatalog` where
 * possible.
 */
export const PLATFORM_ATTRIBUTION_AVATAR_ID = "platform_steward";

/** Accent for platform-attributed Wave rows and related chrome. */
export const PLATFORM_ATTRIBUTION_ACCENT_COLOR = "#d4af37";

/**
 * Session-log namespace; {@link import("./platformLog").platformLog} emits
 * `${PLATFORM_LOG_CATEGORY}_${event}`.
 */
export const PLATFORM_LOG_CATEGORY = "platform";

/**
 * Per-source cache files under `%LOCALAPPDATA%/avatars/data/platform/`.
 */
export const PLATFORM_CACHE_FILES = {
  email: "source_cache.email.json",
  calendar: "source_cache.calendar.json",
  contacts: "source_cache.contacts.json",
} as const;

/** localStorage fallback keys when Tauri disk is unavailable (tests, browser dev). */
export const PLATFORM_CACHE_STORAGE_KEYS = {
  email: "avatars_platform_source_cache_email_v1",
  calendar: "avatars_platform_source_cache_calendar_v1",
  contacts: "avatars_platform_source_cache_contacts_v1",
} as const;

export const PLATFORM_CACHE_SCHEMA_VERSION = 1 as const;

/** Default background runner intervals (ms). Configurable later. */
export const PLATFORM_RUNNER_INTERVAL_MS = {
  email: 120_000,
  calendar: 300_000,
  contacts: 600_000,
} as const;

/** Minimum gap between a manual `refreshNow` and a scheduled tick (debounce). */
export const PLATFORM_RUNNER_MIN_GAP_MS = 15_000;

/** Scheduler v1 tick for due/snoozed task state (Phase 2). */
export const PLATFORM_SCHEDULER_INTERVAL_MS = 60_000;

/** Durable project/task store file. */
export const PLATFORM_STORE_FILE = "platform_store.json";
export const PLATFORM_STORE_STORAGE_KEY = "avatars_platform_store_v1";
export const PLATFORM_STORE_SCHEMA_VERSION = 1 as const;

/** Durable drafts store. */
export const PLATFORM_DRAFTS_FILE = "platform_drafts.json";
export const PLATFORM_DRAFTS_STORAGE_KEY = "avatars_platform_drafts_v1";
export const PLATFORM_DRAFTS_SCHEMA_VERSION = 1 as const;
