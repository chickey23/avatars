/**
 * Driver: glue between `pollAll` and `postSyntheticMessage`.
 *
 * Callers (AppContext on mount, bus/store subscriptions) invoke
 * `runMonitorsAndPost(reason, catalog)` and the driver:
 *   1. Runs every registered monitor whose triggers include `reason`.
 *   2. Converts each resulting `MonitorPost` into a synthetic chat message.
 *   3. Aggregates unclaimed/duplicate contract names into a single warning
 *      posted through `monitor:unclaimed_contracts` (or the system-tagged
 *      fallback described in `unclaimedContracts.ts`).
 */

import type { Avatar } from "../../types";
import { postMonitorPost, postSyntheticMessage } from "./postSynthetic";
import { pollAll, type MonitorRunContext, type MonitorTrigger } from "./registry";
import {
  buildUnclaimedContractsWarning,
  UNCLAIMED_CONTRACTS_MONITOR_NAME,
} from "./unclaimedContracts";

export async function runMonitorsAndPost(
  reason: MonitorTrigger,
  catalog: readonly Avatar[],
  options: Pick<MonitorRunContext, "latestUserMessage" | "primaryAvatarId"> = {}
): Promise<void> {
  const result = await pollAll(reason, catalog, options);

  for (const { name, posts } of result.postsByMonitor) {
    for (const post of posts) {
      postMonitorPost(post, name);
    }
  }

  /**
   * Exclude the unclaimed_contracts monitor itself from the warning — if it
   * is the only thing unclaimed we handle that via the fallback path inside
   * `buildUnclaimedContractsWarning`.
   */
  const unclaimedOthers = result.unclaimed.filter(
    (n) => n !== UNCLAIMED_CONTRACTS_MONITOR_NAME
  );
  const warning = buildUnclaimedContractsWarning({
    catalog,
    unclaimed: unclaimedOthers,
    duplicate: result.duplicate,
  });
  if (warning) {
    postSyntheticMessage({
      avatarId: warning.authorAvatarId,
      monitorTag: `monitor:${UNCLAIMED_CONTRACTS_MONITOR_NAME}`,
      content: warning.post.content,
      dedupKey: warning.post.dedupKey,
      actions: warning.post.actions,
    });
  }
}
