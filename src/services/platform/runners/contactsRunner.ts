/**
 * Platform contacts runner — same shape as email/calendar runners.
 */

import {
  PLATFORM_RUNNER_INTERVAL_MS,
  PLATFORM_RUNNER_MIN_GAP_MS,
} from "../constants";
import { contractLog } from "../../sessionLog/contractLog";
import { sourceRunnerMonitorName } from "../../monitors/sourceRunners";

const CONTACTS_CONTRACT = sourceRunnerMonitorName("contacts");
import { diffTopK, publishPlatformEvent } from "../bus";
import {
  readSourceCache,
  writeSourceCache,
  hashItemIds,
} from "../sourceCache";
import { rankContactsForBackground } from "./background";
import { LEGACY_CONTEXT_ENTRY_BUDGETS } from "../../../utils/contextEntryBudget";
import type { Contact } from "../../../connectors/types";

export type ContactsRunnerHandle = {
  stop: () => void;
  refreshNow: () => Promise<void>;
};

export type StartContactsRunnerOptions = {
  fetchAll?: (limit: number) => Promise<Contact[]>;
  intervalMs?: number;
  runImmediately?: boolean;
};

async function defaultFetchAll(limit: number): Promise<Contact[]> {
  const { fetchContacts } = await import("../../../connectors/gmail");
  return fetchContacts(limit);
}

export function startContactsRunner(
  options: StartContactsRunnerOptions = {}
): ContactsRunnerHandle {
  const fetchAll = options.fetchAll ?? defaultFetchAll;
  const intervalMs = options.intervalMs ?? PLATFORM_RUNNER_INTERVAL_MS.contacts;
  const runImmediately = options.runImmediately ?? true;

  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastRunAt = 0;
  let inFlight: Promise<void> | null = null;

  const tick = async (reason: "interval" | "manual" | "initial"): Promise<void> => {
    if (stopped) return;
    const now = Date.now();
    if (reason !== "initial" && now - lastRunAt < PLATFORM_RUNNER_MIN_GAP_MS) {
      contractLog(CONTACTS_CONTRACT, "runner_skipped", `contacts runner debounced (${reason})`, {
        level: "info",
      });
      return;
    }
    lastRunAt = now;
    const started = performance.now();
    try {
      const items = await fetchAll(
        LEGACY_CONTEXT_ENTRY_BUDGETS.contactsFetchLimit
      );
      const { topKIds } = rankContactsForBackground(items);
      const prev = await readSourceCache("contacts");
      const nextHash = hashItemIds(items);
      const hashChanged = !prev || prev.snapshotHash !== nextHash;
      const topChanged =
        !prev ||
        prev.topKIds.length !== topKIds.length ||
        prev.topKIds.some((id, i) => id !== topKIds[i]);

      if (!hashChanged && !topChanged) {
        contractLog(CONTACTS_CONTRACT, "runner_tick", "contacts unchanged, cache skipped", {
          level: "info",
        });
      } else {
        const snapshot = await writeSourceCache({
          kind: "contacts",
          items,
          topKIds,
          fetchedAt: now,
        });
        publishPlatformEvent({
          type: "source_cache_updated",
          kind: "contacts",
          snapshot,
        });
        if (topChanged) {
          const diff = diffTopK(prev?.topKIds ?? [], topKIds);
          publishPlatformEvent({
            type: "source_top_changed",
            kind: "contacts",
            addedIds: diff.addedIds,
            removedIds: diff.removedIds,
            snapshot,
          });
        }
      }

      publishPlatformEvent({
        type: "runner_heartbeat",
        kind: "contacts",
        fetchedAt: now,
        durationMs: Math.round(performance.now() - started),
        itemCount: items.length,
      });
    } catch (e) {
      contractLog(CONTACTS_CONTRACT, "runner_error", "contacts runner failed", {
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
