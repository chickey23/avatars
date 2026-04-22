/**
 * Platform calendar runner — companion to the email runner; same lifecycle and
 * delta-emission discipline. See `emailRunner.ts` for shape.
 */

import {
  PLATFORM_RUNNER_INTERVAL_MS,
  PLATFORM_RUNNER_MIN_GAP_MS,
} from "../constants";
import { contractLog } from "../../sessionLog/contractLog";
import { sourceRunnerMonitorName } from "../../monitors/sourceRunners";

const CALENDAR_CONTRACT = sourceRunnerMonitorName("calendar");
import { diffTopK, publishPlatformEvent } from "../bus";
import {
  readSourceCache,
  writeSourceCache,
  hashItemIds,
} from "../sourceCache";
import { rankCalendarForBackground } from "./background";
import { LEGACY_CONTEXT_ENTRY_BUDGETS } from "../../../utils/contextEntryBudget";
import type { CalendarEvent } from "../../../connectors/types";

export type CalendarRunnerHandle = {
  stop: () => void;
  refreshNow: () => Promise<void>;
};

export type StartCalendarRunnerOptions = {
  fetchUpcoming?: (days: number, limit: number) => Promise<CalendarEvent[]>;
  intervalMs?: number;
  runImmediately?: boolean;
};

async function defaultFetchUpcoming(
  days: number,
  limit: number
): Promise<CalendarEvent[]> {
  const { fetchCalendarUpcoming } = await import("../../../connectors/gmail");
  return fetchCalendarUpcoming(days, limit);
}

export function startCalendarRunner(
  options: StartCalendarRunnerOptions = {}
): CalendarRunnerHandle {
  const fetchUpcoming = options.fetchUpcoming ?? defaultFetchUpcoming;
  const intervalMs = options.intervalMs ?? PLATFORM_RUNNER_INTERVAL_MS.calendar;
  const runImmediately = options.runImmediately ?? true;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRunAt = 0;
  let inFlight: Promise<void> | null = null;

  const tick = async (reason: "interval" | "manual" | "initial"): Promise<void> => {
    if (stopped) return;
    const now = Date.now();
    if (reason !== "initial" && now - lastRunAt < PLATFORM_RUNNER_MIN_GAP_MS) {
      contractLog(CALENDAR_CONTRACT, "runner_skipped", `calendar runner debounced (${reason})`, {
        level: "info",
      });
      return;
    }
    lastRunAt = now;
    const started = performance.now();
    try {
      const items = await fetchUpcoming(
        LEGACY_CONTEXT_ENTRY_BUDGETS.calendarDays,
        LEGACY_CONTEXT_ENTRY_BUDGETS.calendarMaxResults
      );
      const { topKIds } = rankCalendarForBackground(items);
      const prev = await readSourceCache("calendar");
      const nextHash = hashItemIds(items);
      const hashChanged = !prev || prev.snapshotHash !== nextHash;
      const topChanged =
        !prev ||
        prev.topKIds.length !== topKIds.length ||
        prev.topKIds.some((id, i) => id !== topKIds[i]);

      if (!hashChanged && !topChanged) {
        contractLog(CALENDAR_CONTRACT, "runner_tick", "calendar unchanged, cache skipped", {
          level: "info",
        });
      } else {
        const snapshot = await writeSourceCache({
          kind: "calendar",
          items,
          topKIds,
          fetchedAt: now,
        });
        publishPlatformEvent({
          type: "source_cache_updated",
          kind: "calendar",
          snapshot,
        });
        if (topChanged) {
          const diff = diffTopK(prev?.topKIds ?? [], topKIds);
          publishPlatformEvent({
            type: "source_top_changed",
            kind: "calendar",
            addedIds: diff.addedIds,
            removedIds: diff.removedIds,
            snapshot,
          });
        }
      }

      publishPlatformEvent({
        type: "runner_heartbeat",
        kind: "calendar",
        fetchedAt: now,
        durationMs: Math.round(performance.now() - started),
        itemCount: items.length,
      });
    } catch (e) {
      contractLog(CALENDAR_CONTRACT, "runner_error", "calendar runner failed", {
        level: "error",
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const schedule = (): void => {
    if (stopped) return;
    timer = setTimeout(() => {
      inFlight = tick("interval").finally(() => {
        inFlight = null;
        schedule();
      });
    }, intervalMs);
  };

  if (runImmediately) {
    inFlight = tick("initial").finally(() => {
      inFlight = null;
      schedule();
    });
  } else {
    schedule();
  }

  return {
    stop: () => {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    refreshNow: async () => {
      await (inFlight ?? Promise.resolve());
      await tick("manual");
    },
  };
}
