/**
 * Platform scheduler — walks the project/task store on a slow tick and emits
 * proactive notifications for items whose `dueAt` has arrived (or whose
 * `snoozedUntil` has elapsed).
 *
 * Attribution rule: the scheduler is *owned* by the platform path but notifications
 * are attributed to the item's `ownerAvatarId`. When no owner is set, the
 * scheduler skips the item — the platform layer will not invent a steward,
 * so silence is the right default.
 *
 * Re-fire protection: each `(itemId, reason, dueAt)` tuple fires at most
 * once until its state changes. The fire-log is in-memory for v1; we can
 * persist it in Phase 2.5 if the user sees duplicates across restarts.
 */

import { PLATFORM_SCHEDULER_INTERVAL_MS } from "./constants";
import { contractLog } from "../sessionLog/contractLog";
import { DUE_AND_SNOOZED_ITEMS_MONITOR_NAME } from "../monitors/dueAndSnoozedItems";
import { publishPlatformEvent } from "./bus";
import {
  getPlatformStore,
  subscribePlatformStore,
  type PlatformProjectRecord,
  type PlatformTaskRecord,
} from "./store";
import type {
  NotificationSourceRef,
  NotificationUrgency,
} from "../../types";

export type SchedulerFireReason = "due" | "unsnoozed";

export type SchedulerFireEvent = {
  type: "scheduler_fire";
  itemId: string;
  itemKind: "project" | "task";
  ownerAvatarId: string;
  reason: SchedulerFireReason;
  urgency: NotificationUrgency;
  topicSummary: string;
  sourceRef: NotificationSourceRef;
  firedAt: number;
};

export type SchedulerHandle = {
  stop: () => void;
  /** Force an immediate scan; useful in tests and after owner assignment. */
  scanNow: () => SchedulerFireEvent[];
};

export type StartSchedulerOptions = {
  intervalMs?: number;
  now?: () => number;
  /** Override for tests so we control the fire history. */
  onFire?: (e: SchedulerFireEvent) => void;
};

/** Narrow shared surface between Project and Task so the scan loop is uniform. */
type SchedulableItem = {
  id: string;
  itemKind: "project" | "task";
  title: string;
  dueAt?: number;
  snoozedUntil?: number;
  ownerAvatarId?: string;
  status: string;
};

function projectAsItem(p: PlatformProjectRecord): SchedulableItem {
  return {
    id: p.id,
    itemKind: "project",
    title: p.title,
    dueAt: p.dueAt,
    snoozedUntil: p.snoozedUntil,
    ownerAvatarId: p.ownerAvatarId,
    status: p.status,
  };
}

function taskAsItem(t: PlatformTaskRecord): SchedulableItem {
  return {
    id: t.id,
    itemKind: "task",
    title: t.title,
    dueAt: t.dueAt,
    snoozedUntil: t.snoozedUntil,
    ownerAvatarId: t.ownerAvatarId,
    status: t.status,
  };
}

/** Skip items that are already resolved so we don't nag about done work. */
function isResolved(item: SchedulableItem): boolean {
  return (
    item.status === "done" ||
    item.status === "archived" ||
    item.status === "cancelled"
  );
}

function urgencyFor(dueAt: number, now: number): NotificationUrgency {
  const dt = now - dueAt;
  /** > 24h overdue: high; 0–24h: medium; upcoming within 5m window: low. */
  if (dt > 24 * 60 * 60 * 1000) return "high";
  if (dt >= 0) return "medium";
  return "low";
}

function fireKey(
  itemKind: "project" | "task",
  id: string,
  reason: SchedulerFireReason,
  dueAt: number | undefined,
  snoozedUntil: number | undefined
): string {
  const anchor = reason === "due" ? dueAt ?? 0 : snoozedUntil ?? 0;
  return `${itemKind}:${id}:${reason}:${anchor}`;
}

export function startPlatformScheduler(
  options: StartSchedulerOptions = {}
): SchedulerHandle {
  const intervalMs = options.intervalMs ?? PLATFORM_SCHEDULER_INTERVAL_MS;
  const nowFn = options.now ?? (() => Date.now());
  const fired = new Set<string>();

  const scanOnce = (): SchedulerFireEvent[] => {
    const now = nowFn();
    const store = getPlatformStore();
    const items: SchedulableItem[] = [
      ...Object.values(store.projects).map(projectAsItem),
      ...Object.values(store.tasks).map(taskAsItem),
    ];
    const out: SchedulerFireEvent[] = [];
    for (const item of items) {
      if (isResolved(item)) continue;
      if (!item.ownerAvatarId) continue;

      const reasons: SchedulerFireReason[] = [];
      if (item.dueAt !== undefined && item.dueAt <= now) reasons.push("due");
      if (item.snoozedUntil !== undefined && item.snoozedUntil <= now) {
        reasons.push("unsnoozed");
      }

      for (const reason of reasons) {
        const key = fireKey(
          item.itemKind,
          item.id,
          reason,
          item.dueAt,
          item.snoozedUntil
        );
        if (fired.has(key)) continue;
        fired.add(key);

        const dueAt = item.dueAt ?? item.snoozedUntil ?? now;
        const urgency = urgencyFor(dueAt, now);
        const evt: SchedulerFireEvent = {
          type: "scheduler_fire",
          itemId: item.id,
          itemKind: item.itemKind,
          ownerAvatarId: item.ownerAvatarId,
          reason,
          urgency,
          topicSummary:
            reason === "due"
              ? `${item.itemKind === "project" ? "Project" : "Task"} due: ${item.title}`
              : `${item.itemKind === "project" ? "Project" : "Task"} is back off snooze: ${item.title}`,
          sourceRef:
            item.itemKind === "project"
              ? { kind: "project", id: item.id }
              : { kind: "task", id: item.id },
          firedAt: now,
        };
        out.push(evt);
        options.onFire?.(evt);
        publishPlatformEvent(evt);
        contractLog(
          DUE_AND_SNOOZED_ITEMS_MONITOR_NAME,
          "scheduler_fire",
          `${evt.itemKind} ${evt.itemId} -> ${evt.ownerAvatarId} (${reason})`,
          { level: "info" }
        );
      }
    }
    if (out.length === 0) {
      contractLog(
        DUE_AND_SNOOZED_ITEMS_MONITOR_NAME,
        "scheduler_tick",
        `scan idle (${items.length} items)`,
        { level: "info" }
      );
    }
    return out;
  };

  let stopped = false;
  let timer: ReturnType<typeof setInterval> | null = null;

  /**
   * When the store mutates we re-scan so user-added due dates fire on the
   * next tick without waiting a full minute.
   */
  const unsubscribe = subscribePlatformStore(() => {
    if (!stopped) scanOnce();
  });

  /** Initial scan so fresh app starts pick up overdue items immediately. */
  scanOnce();
  timer = setInterval(() => {
    if (!stopped) scanOnce();
  }, intervalMs);

  return {
    stop: () => {
      stopped = true;
      if (timer) clearInterval(timer);
      timer = null;
      unsubscribe();
    },
    scanNow: scanOnce,
  };
}
