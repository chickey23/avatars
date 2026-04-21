import type { SituationContext } from "../../types";
import { getSortedCoreAvatars } from "./sort";
import { resolvePrimarySlotCount } from "../../store/primaryRoster";
import { getFullAvatarCatalog } from "../../store/avatarCatalog";

/**
 * Executor for tools / UI: valid override, else first preferred id in catalog,
 * else first avatar in score-sorted core.
 */
export function resolveExecutorAvatarId(
  ctx: SituationContext,
  preferredOrder?: string[]
): string {
  const catalog = getFullAvatarCatalog(ctx);
  const slotCount = resolvePrimarySlotCount(ctx, catalog.length);
  const core = getSortedCoreAvatars(catalog, ctx.avatarRosterPriorityScoreById, slotCount);
  const firstCore = core[0]?.id ?? "";
  const catalogIds = new Set(catalog.map((a) => a.id));
  const override = ctx.executorOverrideAvatarId?.trim();
  if (override && catalogIds.has(override)) {
    return override;
  }
  if (preferredOrder?.length) {
    for (const id of preferredOrder) {
      const t = id?.trim();
      if (t && catalogIds.has(t)) return t;
    }
  }
  return firstCore;
}
