/**
 * Structured fields applied when opening the avatar builder from the Creation
 * workshop (wiki extract + optional Ollama JSON extraction).
 */
export type AvatarBuilderSeedFieldPrefill = {
  givenName?: string;
  appellation?: string;
  description?: string;
  personality?: string;
  tags?: string[];
  interests?: string[];
  /** CSS hex #rrggbb when confident; otherwise omit. */
  accentColor?: string;
  /** Optional portrait image URL surfaced as a notice/reference only (v1). */
  portraitImageUrl?: string;
};
