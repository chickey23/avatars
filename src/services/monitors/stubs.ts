/**
 * Stub monitors — names registered so contracts can be claimed via
 * `systemTags` without code changes. Bodies are intentionally empty; each
 * one ships full implementation when the user asks for it.
 */

import { registerMonitor, type MonitorDef } from "./registry";

const STUB_MONITORS: MonitorDef[] = [
  {
    name: "worldview_gaps",
    required: false,
    triggers: ["startup", "store_change"],
    description:
      "Scans world_metadata for people/projects referenced but undefined.",
    run: () => [],
  },
  {
    name: "source_cache_staleness",
    required: false,
    triggers: ["startup", "source_change"],
    description: "Fires when any source cache exceeds its TTL.",
    run: () => [],
  },
  {
    name: "gmail_auth_drift",
    required: false,
    triggers: ["startup", "source_change"],
    description:
      "Fires when the Gmail token scope/refresh is missing or stale.",
    run: () => [],
  },
  {
    name: "overdue_drafts",
    required: false,
    triggers: ["startup", "store_change"],
    description:
      "Fires when platform drafts sit in `pending` past a threshold.",
    run: () => [],
  },
];

export function registerStubMonitors(): void {
  for (const def of STUB_MONITORS) registerMonitor(def);
}

export function listStubMonitorNames(): string[] {
  return STUB_MONITORS.map((m) => m.name);
}
