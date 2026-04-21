import type { UserProfileRecord } from "./types";

/** Prefix referenced by AI rules (`user-context-contract`). Keep in sync with rules library. */
export const USER_PROFILE_RELEVANCE_PREFIX = "User profile (local):";

/**
 * Lines for `relevantData` when the user has filled any profile fields.
 */
export function userProfileToRelevanceLines(
  profile: UserProfileRecord | undefined
): string[] {
  if (!profile) return [];
  const name = profile.displayName?.trim();
  const pronouns = profile.pronouns?.trim();
  const notes = profile.notes?.trim();
  if (!name && !pronouns && !notes) return [];

  const parts: string[] = [];
  if (name) parts.push(`name: ${name}`);
  if (pronouns) parts.push(`pronouns: ${pronouns}`);
  if (notes) {
    const n = notes.replace(/\s+/g, " ");
    parts.push(`notes: ${n.length > 600 ? `${n.slice(0, 597)}…` : n}`);
  }
  return [`${USER_PROFILE_RELEVANCE_PREFIX} ${parts.join("; ")}`];
}
