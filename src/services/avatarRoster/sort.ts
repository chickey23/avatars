import type { Avatar } from "../../types";
import { getRosterScore } from "./scores";

/** Sort by score descending, then avatar id ascending. */
export function sortAvatarsByRosterScore(
  catalog: Avatar[],
  scores: Record<string, number> | undefined
): Avatar[] {
  return [...catalog].sort((a, b) => {
    const sa = getRosterScore(scores, a.id);
    const sb = getRosterScore(scores, b.id);
    if (sb !== sa) return sb - sa;
    return a.id.localeCompare(b.id);
  });
}

export function getSortedCoreAvatars(
  catalog: Avatar[],
  scores: Record<string, number> | undefined,
  slotCount: number
): Avatar[] {
  const sorted = sortAvatarsByRosterScore(catalog, scores);
  return sorted.slice(0, Math.max(0, slotCount));
}
