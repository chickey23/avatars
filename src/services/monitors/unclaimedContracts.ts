/**
 * `monitor:unclaimed_contracts` — a meta-monitor that warns when any other
 * required monitor has no claimant. It does NOT run itself through the
 * normal `pollAll` path; instead callers hand it the `unclaimed` list from
 * the most recent poll and it produces a single aggregate post.
 *
 * Self-warning fallback: if nobody is tagged `monitor:unclaimed_contracts`,
 * we pick the first `system`-tagged avatar in the catalog as author so the
 * warning still surfaces. If no system avatars exist, the warning is logged
 * only (we do not forge a user-role message).
 */

import type { Avatar } from "../../types";
import {
  findAvatarsWithTag,
  hasSystemTag,
  monitorTag,
  SYSTEM_TAG,
} from "../avatarTags";
import { appendSessionLog } from "../sessionLog";
import type { MonitorPost } from "./registry";

export const UNCLAIMED_CONTRACTS_MONITOR_NAME = "unclaimed_contracts" as const;

export interface UnclaimedWarningInput {
  catalog: readonly Avatar[];
  unclaimed: readonly string[];
  duplicate: readonly string[];
}

/**
 * Build a single `MonitorPost` warning about unclaimed / duplicate contracts,
 * or return `null` if nothing needs warning about. The chosen author is:
 *   1. The first avatar carrying `monitor:unclaimed_contracts`.
 *   2. Otherwise the first `system`-tagged avatar.
 *   3. Otherwise null + a session-log warning.
 */
export function buildUnclaimedContractsWarning(
  input: UnclaimedWarningInput
): { post: MonitorPost; authorAvatarId: string } | null {
  const { catalog, unclaimed, duplicate } = input;
  if (unclaimed.length === 0 && duplicate.length === 0) return null;

  const claimants = findAvatarsWithTag(
    catalog,
    monitorTag(UNCLAIMED_CONTRACTS_MONITOR_NAME)
  );
  const primary = claimants[0];
  const fallback = catalog.find((a) => hasSystemTag(a, SYSTEM_TAG));
  const author = primary ?? fallback;

  if (!author) {
    appendSessionLog("monitors", "unclaimed_contracts_no_author", {
      level: "warn",
      detail: `unclaimed=${unclaimed.join(",")} duplicate=${duplicate.join(",")}`,
    });
    return null;
  }

  const parts: string[] = [];
  if (unclaimed.length) {
    parts.push(
      `Unclaimed monitor contracts: ${unclaimed.join(", ")}. Tag an avatar with \`monitor:<name>\` to assign one.`
    );
  }
  if (duplicate.length) {
    parts.push(
      `Multiple avatars claim: ${duplicate.join(", ")}. One-holder rule — remove the tag from all but one.`
    );
  }
  const content = parts.join(" ");

  const post: MonitorPost = {
    avatarId: author.id,
    content,
    dedupKey: `${unclaimed.slice().sort().join("|")}::${duplicate.slice().sort().join("|")}`,
    actions: [],
  };
  return { post, authorAvatarId: author.id };
}
