/**
 * Tag-driven log namespace for monitor contracts.
 *
 * `platformLog` (see `../platform/platformLog.ts`) uses `platform_<event>` categories
 * for non-contract infrastructure: runners, store, scheduler, draft pipeline, etc.
 *
 * `contractLog` emits `contract:<contract-name>__<event>` where **`<contract-name>`
 * is exactly the monitor's name** — the part after the `monitor:` tag prefix in
 * `Avatar.systemTags` (e.g. tag `monitor:source_runner:email` →
 * `contract:source_runner:email__...`). The Storage visualizer's log tail filters on
 * `contract:` and uses that name to match rows to the Background contract table and claimants.
 */

import { appendSessionLog, type SessionLogLevel } from "../sessionLog";

export const CONTRACT_LOG_PREFIX = "contract:" as const;
export const CONTRACT_EVENT_SEPARATOR = "__" as const;

export interface ContractLogOptions {
  level?: SessionLogLevel;
  detail?: string;
}

/**
 * Emits a session-log row in the contract namespace.
 *
 * Example: `contractLog("source_runner:email", "runner_tick", "email cache hit")`
 * produces category `contract:source_runner:email__runner_tick`.
 */
export function contractLog(
  contractName: string,
  event: string,
  message: string,
  opts?: ContractLogOptions
): void {
  const category = `${CONTRACT_LOG_PREFIX}${contractName}${CONTRACT_EVENT_SEPARATOR}${event}`;
  appendSessionLog(category, message, opts);
}

/**
 * Reverses the encoding produced by {@link contractLog}. Returns `null` if
 * the category isn't in the contract namespace. Used by the Storage
 * visualizer to label log rows by claimant.
 */
export function parseContractLogCategory(
  category: string
): { contract: string; event: string } | null {
  if (!category.startsWith(CONTRACT_LOG_PREFIX)) return null;
  const rest = category.slice(CONTRACT_LOG_PREFIX.length);
  const sepAt = rest.indexOf(CONTRACT_EVENT_SEPARATOR);
  if (sepAt < 0) return { contract: rest, event: "" };
  return {
    contract: rest.slice(0, sepAt),
    event: rest.slice(sepAt + CONTRACT_EVENT_SEPARATOR.length),
  };
}
