import { PERSONALITY_TRAITS, type PersonalityTraitId } from "../theme/designTokens";
import { AI_RULE_BLOCKS } from "../data/aiRulesLibrary";

/** Meta-prompt for the Well of Souls (personality rule generator). The string may say "meta-agent" for the LLM persona; that is not SPEC "Agent" terminology — see docs/STYLEGUIDE.md. */
export function buildWellOfSoulsPrompt(
  seed: string,
  traitIds: PersonalityTraitId[],
  ruleBlockIds: string[]
): string {
  const labels = traitIds
    .map((id) => PERSONALITY_TRAITS.find((t) => t.id === id)?.label ?? id)
    .join(", ");
  const ruleLabels = ruleBlockIds
    .map((id) => AI_RULE_BLOCKS.find((b) => b.id === id)?.title ?? id)
    .join(", ");
  return `You are the Well of Souls, a meta-agent that writes concise personality rule blocks for AI avatars in a product called Avatars.
Output plain text only. Format: 4–8 lines; each line starts with "- " and is one actionable rule for how the avatar should speak and reason (tone, habits, boundaries).
Traits to emphasize: ${labels || "balanced, clear"}.
Library rule blocks already in scope for this avatar (honor their intent): ${ruleLabels || "(none selected)"}.
User creative seed or theme:
${seed.trim() || "(none)"}

Rules:`;
}
