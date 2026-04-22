/**
 * Platform email runner — periodically fetches recent messages, writes the
 * durable cache, and publishes delta events on top-K change.
 *
 * Runners own `fetch + cache writes`, not ranking for the turn. Per-turn
 * relevance still happens inside `processUserTurn` (now cache-aware).
 */

import {
  PLATFORM_RUNNER_INTERVAL_MS,
  PLATFORM_RUNNER_MIN_GAP_MS,
} from "../constants";
import { contractLog } from "../../sessionLog/contractLog";
import { sourceRunnerMonitorName } from "../../monitors/sourceRunners";

const EMAIL_CONTRACT = sourceRunnerMonitorName("email");
import { diffTopK, publishPlatformEvent } from "../bus";
import {
  readSourceCache,
  writeSourceCache,
  hashItemIds,
} from "../sourceCache";
import { rankEmailsForBackground } from "./background";
import { LEGACY_CONTEXT_ENTRY_BUDGETS } from "../../../utils/contextEntryBudget";
import type { EmailItem } from "../../../connectors/types";

export type EmailRunnerHandle = {
  stop: () => void;
  /** Force an immediate fetch; respects the min-gap debounce. */
  refreshNow: () => Promise<void>;
};

export type StartEmailRunnerOptions = {
  /** Override for tests. Defaults to the real Gmail connector. */
  fetchRecent?: (limit: number) => Promise<EmailItem[]>;
  /** Override for tests. Defaults to `PLATFORM_RUNNER_INTERVAL_MS.email`. */
  intervalMs?: number;
  /** Immediate first tick on start (default true). */
  runImmediately?: boolean;
};

async function defaultFetchRecent(limit: number): Promise<EmailItem[]> {
  const { gmailConnector } = await import("../../../connectors/gmail");
  return gmailConnector.fetchRecent(limit);
}

export function startEmailRunner(
  options: StartEmailRunnerOptions = {}
): EmailRunnerHandle {
  const fetchRecent = options.fetchRecent ?? defaultFetchRecent;
  const intervalMs = options.intervalMs ?? PLATFORM_RUNNER_INTERVAL_MS.email;
  const runImmediately = options.runImmediately ?? true;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRunAt = 0;
  let inFlight: Promise<void> | null = null;

  const tick = async (reason: "interval" | "manual" | "initial"): Promise<void> => {
    if (stopped) return;
    const now = Date.now();
    if (reason !== "initial" && now - lastRunAt < PLATFORM_RUNNER_MIN_GAP_MS) {
      contractLog(EMAIL_CONTRACT, "runner_skipped", `email runner debounced (${reason})`, {
        level: "info",
      });
      return;
    }
    lastRunAt = now;
    const started = performance.now();
    try {
      const items = await fetchRecent(
        LEGACY_CONTEXT_ENTRY_BUDGETS.emailFetchLimit
      );
      const { topKIds } = rankEmailsForBackground(items);
      const prev = await readSourceCache("email");
      const nextHash = hashItemIds(items);
      const hashChanged = !prev || prev.snapshotHash !== nextHash;
      const topChanged =
        !prev ||
        prev.topKIds.length !== topKIds.length ||
        prev.topKIds.some((id, i) => id !== topKIds[i]);

      if (!hashChanged && !topChanged) {
        contractLog(EMAIL_CONTRACT, "runner_tick", "email unchanged, cache skipped", {
          level: "info",
        });
      } else {
        const snapshot = await writeSourceCache({
          kind: "email",
          items,
          topKIds,
          fetchedAt: now,
        });
        publishPlatformEvent({
          type: "source_cache_updated",
          kind: "email",
          snapshot,
        });
        if (topChanged) {
          const diff = diffTopK(prev?.topKIds ?? [], topKIds);
          publishPlatformEvent({
            type: "source_top_changed",
            kind: "email",
            addedIds: diff.addedIds,
            removedIds: diff.removedIds,
            snapshot,
          });
        }
      }

      publishPlatformEvent({
        type: "runner_heartbeat",
        kind: "email",
        fetchedAt: now,
        durationMs: Math.round(performance.now() - started),
        itemCount: items.length,
      });
    } catch (e) {
      contractLog(EMAIL_CONTRACT, "runner_error", "email runner failed", {
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
