import type { SituationContext } from "../../types";
import { getSortedCoreAvatars } from "./sort";
import { resolvePrimarySlotCount } from "../../store/primaryRoster";
import { getFullAvatarCatalog } from "../../store/avatarCatalog";
import { filterOutSystemAvatars, isSystemAvatarId } from "../platform/routing";

/**
 * Executor for tools / UI: valid override, else first preferred id in catalog,
 * else first avatar in score-sorted core.
 *
 * System avatars are never eligible for automatic executor selection.
 * An explicit override or preferred id can still target a system avatar when
 * the caller wants it (e.g. a system-avatar flow).
 */
export function resolveExecutorAvatarId(
  ctx: SituationContext,
  preferredOrder?: string[]
): string {
  const catalog = getFullAvatarCatalog(ctx);
  const routable = filterOutSystemAvatars(catalog);
  const slotCount = resolvePrimarySlotCount(ctx, routable.length);
  const core = getSortedCoreAvatars(routable, ctx.avatarRosterPriorityScoreById, slotCount);
  const firstCore = core[0]?.id ?? "";
  const catalogIds = new Set(catalog.map((a) => a.id));
  const override = ctx.executorOverrideAvatarId?.trim();
  /**
   * An explicit override represents user intent, so system avatars are
   * allowed here (matches the docstring contract). Automatic heuristics
   * below still skip system avatars.
   */
  if (override && catalogIds.has(override)) {
    return override;
  }
  if (preferredOrder?.length) {
    for (const id of preferredOrder) {
      const t = id?.trim();
      if (t && catalogIds.has(t) && !isSystemAvatarId(t)) return t;
    }
  }
  return firstCore;
}
