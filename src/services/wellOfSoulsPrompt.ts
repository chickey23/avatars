import { PERSONALITY_TRAITS, type PersonalityTraitId } from "../theme/designTokens";

/** Meta-prompt for the Well of Souls (personality rule generator). The string may say "meta-agent" for the LLM persona; that is not SPEC "Agent" terminology — see docs/STYLEGUIDE.md. */
export function buildWellOfSoulsPrompt(
  seed: string,
  traitIds: PersonalityTraitId[]
): string {
  const labels = traitIds
    .map((id) => PERSONALITY_TRAITS.find((t) => t.id === id)?.label ?? id)
    .join(", ");
  return `You are the Well of Souls, a meta-agent that writes concise personality rule blocks for AI avatars in a product called Avatars.
Output plain text only. Format: 4–8 lines; each line starts with "- " and is one actionable rule for how the avatar should speak and reason (tone, habits, boundaries).
Traits to emphasize: ${labels || "balanced, clear"}.
User creative seed or theme:
${seed.trim() || "(none)"}

Rules:`;
}
