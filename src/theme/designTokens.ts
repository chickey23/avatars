/**
 * Design tokens: text styles, chat chrome, personality traits.
 * Used for CSS classes, future Well of Souls, and avatar trait pickers.
 */

/** Ten semantic text style keys (CSS: .text-style--{id}) */
export const TEXT_STYLE_IDS = [
  "bodyRules",
  "bodyAi",
  "caption",
  "emphasis",
  "whisper",
  "shout",
  "system",
  "quote",
  "link",
  "code",
] as const;

export type TextStyleId = (typeof TEXT_STYLE_IDS)[number];

/** Five chat column / window chrome presets */
export const CHAT_WINDOW_STYLE_IDS = [
  "default",
  "aurora",
  "paper",
  "midnight",
  "compact",
] as const;

export type ChatWindowStyleId = (typeof CHAT_WINDOW_STYLE_IDS)[number];

/**
 * Personality axes for Well of Souls, avatar builder, and routing labels.
 * When adding traits, extend AI rule blocks if needed — see docs/EXTENDING_TRAITS_AND_RULES.md.
 */
export const PERSONALITY_TRAITS = [
  { id: "warmth", label: "Warmth" },
  { id: "directness", label: "Directness" },
  { id: "humor", label: "Humor" },
  { id: "formality", label: "Formality" },
  { id: "curiosity", label: "Curiosity" },
  { id: "empathy", label: "Empathy" },
  { id: "skepticism", label: "Skepticism" },
  { id: "brevity", label: "Brevity" },
  { id: "metaphor", label: "Metaphor" },
  { id: "precision", label: "Precision" },
  { id: "playfulness", label: "Playfulness" },
  { id: "gravitas", label: "Gravitas" },
] as const;

export type PersonalityTraitId = (typeof PERSONALITY_TRAITS)[number]["id"];

export const CHAT_SKIN_STORAGE_KEY = "avatars_chat_skin";
