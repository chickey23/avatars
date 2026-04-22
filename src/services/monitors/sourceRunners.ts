/**
 * `monitor:source_runner:{email,calendar,contacts}` — contract definitions
 * for the three background source runners.
 *
 * The runner loops live in `src/services/platform/runners/*` and continue to
 * tick on their own. These contracts exist so each runner has a *named
 * steward avatar*: the visualizer uses the claimant to label the row, the
 * unclaimed-contracts monitor surfaces a warning if a steward is removed,
 * and the user can transfer ownership by re-tagging without code changes.
 *
 * `run` is intentionally empty — the runner already publishes heartbeats on
 * the platform bus; we don't want to duplicate that work here.
 */

import type { MonitorDef } from "./registry";
import type { SourceCacheKind } from "../platform";

export const SOURCE_RUNNER_KINDS = ["email", "calendar", "contacts"] as const;
export type SourceRunnerKind = (typeof SOURCE_RUNNER_KINDS)[number];

export function sourceRunnerMonitorName(kind: SourceRunnerKind): string {
  return `source_runner:${kind}`;
}

function buildSourceRunnerMonitor(kind: SourceRunnerKind): MonitorDef {
  return {
    name: sourceRunnerMonitorName(kind),
    required: true,
    triggers: ["startup", "source_change"],
    description: `Stewards the ${kind} background runner; visible in the Storage visualizer Background panel.`,
    run: () => [],
  };
}

export const sourceRunnerMonitors: readonly MonitorDef[] = SOURCE_RUNNER_KINDS.map(
  buildSourceRunnerMonitor
);

/** Convenience for callers that want to look up by `SourceCacheKind`. */
export function isSourceRunnerKind(s: string): s is SourceCacheKind {
  return (SOURCE_RUNNER_KINDS as readonly string[]).includes(s);
}
