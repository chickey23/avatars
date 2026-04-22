/**
 * Thin wrapper around `appendSessionLog` for platform infrastructure events:
 * `appendSessionLog`(`${PLATFORM_LOG_CATEGORY}_${event}`) e.g. `platform_runner_tick`.
 */

import { appendSessionLog, type SessionLogLevel } from "../sessionLog";
import { PLATFORM_LOG_CATEGORY } from "./constants";

export type PlatformLogEvent =
  | "scaffold"
  | "runner_tick"
  | "runner_skipped"
  | "runner_error"
  | "cache_update"
  | "cache_hit"
  | "cache_miss"
  | "cache_write_failed"
  | "scheduler_tick"
  | "scheduler_fire"
  | "store_write"
  | "store_read_failed"
  | "store_migrated"
  | "draft_request"
  | "draft_applied"
  | "draft_rejected"
  | "draft_recorded"
  | "draft_status"
  | "drafts_read_failed";

export function platformLog(
  event: PlatformLogEvent,
  message: string,
  opts?: { level?: SessionLogLevel; detail?: string }
): void {
  appendSessionLog(`${PLATFORM_LOG_CATEGORY}_${event}`, message, opts);
}
