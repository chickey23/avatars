import type { MonitorDef, MonitorRunContext } from "./registry";

export const SET_SUFFICIENCY_MONITOR_NAME = "set_sufficiency" as const;

/**
 * Placeholder monitor for future async populate_set → named_list handoff.
 * Discovery today resolves Wikidata synchronously in the complex-task planner;
 * this hook remains for store-driven wakeups once background populate lands.
 */
export const setSufficiencyMonitor: MonitorDef = {
  name: SET_SUFFICIENCY_MONITOR_NAME,
  required: false,
  triggers: ["store_change"],
  description:
    "Reserved for advancing named_list discovery when structured knowledge sets become sufficient.",
  run: (_ctx: MonitorRunContext) => [],
};
