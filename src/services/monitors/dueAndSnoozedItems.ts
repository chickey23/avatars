/**
 * `monitor:due_and_snoozed_items` — contract representing the platform
 * scheduler. The scheduler loop continues to run in `startPlatformScheduler()`
 * and emit `SchedulerFireEvent`s that `AppContext` translates into
 * `PendingNotification`s (the existing UI path). This monitor exists so the
 * contract is visible in the registry: if no avatar claims the tag, the
 * unclaimed-contracts warning will surface.
 *
 * Future: migrate the scheduler's output onto `postSyntheticMessage` and
 * retire the PendingNotification path once the user signs off.
 */

import { getPlatformStore } from "../platform/store";
import type { MonitorDef } from "./registry";

export const DUE_AND_SNOOZED_ITEMS_MONITOR_NAME = "due_and_snoozed_items" as const;

export const dueAndSnoozedItemsMonitor: MonitorDef = {
  name: DUE_AND_SNOOZED_ITEMS_MONITOR_NAME,
  required: true,
  triggers: ["startup", "store_change"],
  description:
    "Scans platform project/task store for items past their dueAt or snoozedUntil. The scheduler loop owns delivery; this contract makes the claim visible.",
  run: () => {
    /**
     * Intentionally silent: the scheduler publishes `SchedulerFireEvent`s on
     * its own tick and `AppContext` turns them into `PendingNotification`s.
     * We only look at the store here to confirm the contract is reachable.
     */
    void getPlatformStore();
    return [];
  },
};
