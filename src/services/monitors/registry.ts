/**
 * MonitorRegistry — the decentralization backbone.
 *
 * A monitor is a named, contracted responsibility that an avatar may claim
 * via the `monitor:<name>` tag in `systemTags`. On startup and on trigger
 * events (source changes, store changes) the registry polls every registered
 * monitor; for each, it finds the claimant(s) in the current catalog and
 * either runs the monitor's `run` body or surfaces an "unclaimed contract"
 * warning through the `unclaimed_contracts` monitor (non-blocking).
 *
 * Posts produced by monitors are routed through `postSyntheticMessage`
 * (see `./postSynthetic.ts`) so the main chat stays the single UI for
 * avatar-authored communication.
 */

import type { Avatar, NotificationSourceRef } from "../../types";
import {
  findAvatarsWithTag,
  MONITOR_PREFIX,
  monitorTag,
  SYSTEM_TAG,
} from "../avatarTags";
import { appendSessionLog } from "../sessionLog";

export type MonitorTrigger =
  | "startup"
  | "source_change"
  | "store_change"
  | "user_turn";

export interface MonitorAction {
  id: string;
  label: string;
  /** Tooltip / native `title` on the chat action button (optional). */
  hint?: string;
  /** Opaque, serialized payload for the handler registered by the monitor. */
  payload?: unknown;
}

export interface MonitorPost {
  /** Avatar id the synthetic message is attributed to (usually the claimant). */
  avatarId: string;
  /** Short body text. Monitors should keep this under a paragraph. */
  content: string;
  /** Optional inline action buttons rendered on the chat bubble. */
  actions?: MonitorAction[];
  /** Link back to the triggering item for UX and dedup purposes. */
  sourceRef?: NotificationSourceRef;
  /** Stable sub-key for dedup; e.g. `${projectRevision}`. Used together with monitor name. */
  dedupKey?: string;
}

export interface MonitorRunContext {
  /** The avatar carrying `monitor:<name>` for this monitor. */
  ownerAvatarId: string;
  /** Current full catalog (built-ins + user edits + user avatars). */
  catalog: readonly Avatar[];
  /** Why this poll was triggered. */
  trigger: MonitorTrigger;
  /** Unix ms when the poll began. */
  now: number;
  /** Latest user message for `user_turn` monitors. */
  latestUserMessage?: {
    id: string;
    content: string;
    timestamp: number;
  };
  /**
   * Optional: primary / addressed avatar when the user sent a turn (see SendMessageOptions).
   * Monitors may use this for synthetic attribution; omit when unknown.
   */
  primaryAvatarId?: string;
}

export interface MonitorDef {
  name: string;
  /**
   * When true, an unclaimed or unfulfilled contract produces a warning post.
   * When false, the monitor is optional — silently skipped if unclaimed.
   */
  required: boolean;
  triggers: readonly MonitorTrigger[];
  /**
   * Pure by convention (reads stores + catalog). Returns the posts to enqueue
   * for this poll cycle. Return `[]` to remain silent.
   */
  run: (ctx: MonitorRunContext) => Promise<MonitorPost[]> | MonitorPost[];
  /** Optional one-line diagnostic for the Store visualizer panel. */
  description?: string;
  /**
   * Optional author when no avatar claims `monitor:<name>`. Use sparingly for
   * monitors whose contract naturally belongs to an existing system avatar but
   * should not require a local catalog/tag migration to start working.
   */
  fallbackOwnerAvatarId?: string;
}

const registry = new Map<string, MonitorDef>();

export function registerMonitor(def: MonitorDef): void {
  if (registry.has(def.name)) {
    appendSessionLog("monitors", "monitor_replaced", {
      level: "info",
      detail: def.name,
    });
  }
  registry.set(def.name, def);
}

export function unregisterMonitor(name: string): void {
  registry.delete(name);
}

export function listRegisteredMonitors(): MonitorDef[] {
  return Array.from(registry.values());
}

/** Test-only reset. */
export function __resetMonitorsForTests(): void {
  registry.clear();
}

export interface PollResult {
  /** Posts keyed by monitor name, in registration order. */
  postsByMonitor: Array<{ name: string; posts: MonitorPost[] }>;
  /** Monitors that are `required: true` but unclaimed (zero holders). */
  unclaimed: string[];
  /** Monitors with 2+ claimants (ambiguous ownership). */
  duplicate: string[];
}

/**
 * Run every monitor whose `triggers` include `reason`. Monitors with zero
 * claimants surface as `unclaimed` when required; monitors with multiple
 * claimants surface as `duplicate`. Both cases are translated into synthetic
 * warning posts by `unclaimed_contracts` / caller plumbing — not here.
 */
export async function pollAll(
  reason: MonitorTrigger,
  catalog: readonly Avatar[],
  options: Pick<MonitorRunContext, "latestUserMessage" | "primaryAvatarId"> = {}
): Promise<PollResult> {
  const now = Date.now();
  const postsByMonitor: PollResult["postsByMonitor"] = [];
  const unclaimed: string[] = [];
  const duplicate: string[] = [];
  for (const def of registry.values()) {
    if (!def.triggers.includes(reason)) continue;
    const claimants = findAvatarsWithTag(catalog, monitorTag(def.name));
    let owner = claimants[0];
    if (!owner && def.fallbackOwnerAvatarId) {
      owner = catalog.find((a) => a.id === def.fallbackOwnerAvatarId);
    }
    if (!owner && def.fallbackOwnerAvatarId) {
      owner = catalog.find((a) => a.systemTags?.includes(SYSTEM_TAG));
    }
    if (!owner) {
      if (def.required) unclaimed.push(def.name);
      continue;
    }
    if (claimants.length > 1) {
      duplicate.push(def.name);
    }
    /** By convention: first claimant runs; duplicate warning surfaces separately. */
    try {
      const result = await def.run({
        ownerAvatarId: owner.id,
        catalog,
        trigger: reason,
        now,
        latestUserMessage: options.latestUserMessage,
        primaryAvatarId: options.primaryAvatarId,
      });
      if (result.length) {
        postsByMonitor.push({ name: def.name, posts: result });
      }
    } catch (err) {
      appendSessionLog("monitors", "monitor_run_failed", {
        level: "warn",
        detail: `${def.name}: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return { postsByMonitor, unclaimed, duplicate };
}

/**
 * Helper: list every monitor tag currently registered. Useful for UI
 * diagnostics ("is anyone claiming this contract?").
 */
export function listMonitorTags(): string[] {
  return Array.from(registry.keys()).map((name) => `${MONITOR_PREFIX}${name}`);
}
