import type { Avatar } from "../types";
import { AI_RULE_BLOCKS, AI_RULE_SETS } from "../data/aiRulesLibrary";

/** Resolve ordered rule bodies for an avatar from its ruleSetId. */
export function getRuleBodiesForAvatar(avatar: Avatar): { text: string; blockIds: string[] } {
  const set = AI_RULE_SETS.find((s) => s.id === avatar.ruleSetId);
  if (!set) return { text: "", blockIds: [] };
  const bodies: string[] = [];
  const blockIds: string[] = [];
  for (const bid of set.blockIds) {
    const b = AI_RULE_BLOCKS.find((x) => x.id === bid);
    if (b) {
      bodies.push(`[${b.title}] ${b.body}`);
      blockIds.push(bid);
    }
  }
  return { text: bodies.join("\n\n"), blockIds };
}
