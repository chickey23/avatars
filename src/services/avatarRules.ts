import type { Avatar } from "../types";
import { AI_RULE_BLOCKS, AI_RULE_SETS } from "../data/aiRulesLibrary";

function collectBlocksFromIds(ids: string[]): { text: string; blockIds: string[] } {
  const bodies: string[] = [];
  const blockIds: string[] = [];
  for (const bid of ids) {
    const b = AI_RULE_BLOCKS.find((x) => x.id === bid);
    if (b) {
      bodies.push(`[${b.title}] ${b.body}`);
      blockIds.push(bid);
    }
  }
  return { text: bodies.join("\n\n"), blockIds };
}

/** Resolve ordered rule bodies for an avatar from `ruleBlockIds` (preferred) or legacy `ruleSetId`. */
export function getRuleBodiesForAvatar(avatar: Avatar): { text: string; blockIds: string[] } {
  if (avatar.ruleBlockIds?.length) {
    const { text, blockIds } = collectBlocksFromIds(avatar.ruleBlockIds);
    const extra = avatar.supplementalRules?.trim();
    if (extra) {
      return {
        text: text ? `${text}\n\n[Custom] ${extra}` : `[Custom] ${extra}`,
        blockIds,
      };
    }
    return { text, blockIds };
  }

  const set = AI_RULE_SETS.find((s) => s.id === avatar.ruleSetId);
  if (!set) {
    const extra = avatar.supplementalRules?.trim();
    return extra
      ? { text: `[Custom] ${extra}`, blockIds: [] }
      : { text: "", blockIds: [] };
  }
  const { text, blockIds } = collectBlocksFromIds(set.blockIds);
  const extra = avatar.supplementalRules?.trim();
  if (extra) {
    return {
      text: text ? `${text}\n\n[Custom] ${extra}` : `[Custom] ${extra}`,
      blockIds,
    };
  }
  return { text, blockIds };
}
