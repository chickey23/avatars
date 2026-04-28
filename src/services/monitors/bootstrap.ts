/**
 * Central place to register every built-in monitor. Called once from
 * `AppContext` on mount, and once from the bootstrap path in tests that need
 * the default set.
 *
 * Each monitor is a small, named contract (see
 * `./registry.ts`). Phase C ships only the scaffold; Phases D/E/F populate
 * concrete monitors.
 */

import { registerMonitor, __resetMonitorsForTests } from "./registry";
import {
  installUnassignedProjectsActions,
  unassignedProjectsMonitor,
} from "./unassignedProjects";
import { dueAndSnoozedItemsMonitor } from "./dueAndSnoozedItems";
import { complexTaskPlannerMonitor } from "./complexTaskPlanner";
import { sourceRunnerMonitors } from "./sourceRunners";
import { registerStubMonitors } from "./stubs";

let installed = false;

export function installDefaultMonitors(): void {
  if (installed) return;
  installed = true;
  registerMonitor(unassignedProjectsMonitor);
  registerMonitor(dueAndSnoozedItemsMonitor);
  registerMonitor(complexTaskPlannerMonitor);
  for (const m of sourceRunnerMonitors) registerMonitor(m);
  installUnassignedProjectsActions();
  registerStubMonitors();
}

/** Test-only: reset both registry and the installed flag. */
export function __resetDefaultMonitorsForTests(): void {
  installed = false;
  __resetMonitorsForTests();
}
