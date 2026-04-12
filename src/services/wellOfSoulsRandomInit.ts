import { AI_RULE_BLOCKS } from "../data/aiRulesLibrary";
import {
  PERSONALITY_TRAITS,
  type PersonalityTraitId,
} from "../theme/designTokens";

/** Brevity + Stay in character — always included in random Well of Souls init. */
const ALWAYS_ON_RULE_IDS = new Set(["global-brief", "tone-in-character"]);

export function createInitialWellOfSoulsRuleBlocks(): Set<string> {
  const s = new Set<string>();
  for (const b of AI_RULE_BLOCKS) {
    if (ALWAYS_ON_RULE_IDS.has(b.id)) {
      s.add(b.id);
    } else if (Math.random() < 0.5) {
      s.add(b.id);
    }
  }
  return s;
}

export function createInitialWellOfSoulsTraits(): Set<PersonalityTraitId> {
  const s = new Set<PersonalityTraitId>();
  for (const t of PERSONALITY_TRAITS) {
    if (Math.random() < 0.25) {
      s.add(t.id);
    }
  }
  return s;
}
