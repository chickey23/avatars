/**
 * Suggestion scoring for the Unassigned Project Manager monitor.
 *
 * Tiny, deterministic token-overlap score: tokens from a project's title +
 * summary compared against each candidate avatar's tags, interests,
 * appellation, and description. Not a semantic model — good enough for
 * "which avatar looks most relevant" sorting of pre-cached suggestions.
 */

import type { Avatar } from "../../types";

const STOPWORDS = new Set([
  "the", "a", "an", "of", "and", "or", "to", "for", "in", "on", "with",
  "by", "from", "is", "are", "be", "as", "at", "that", "this", "it", "its",
  "into", "about", "my", "your", "our", "their", "i", "we", "you",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function scoreAvatarForProject(
  avatar: Avatar,
  project: { title: string; summary?: string }
): number {
  const projTokens = new Set(tokenize(`${project.title} ${project.summary ?? ""}`));
  if (projTokens.size === 0) return 0;
  const avatarCorpus = [
    avatar.givenName,
    avatar.appellation,
    avatar.description,
    avatar.personality,
    ...(avatar.tags ?? []),
    ...(avatar.interests ?? []),
  ]
    .filter(Boolean)
    .join(" ");
  const avTokens = new Set(tokenize(avatarCorpus));
  if (avTokens.size === 0) return 0;
  let overlap = 0;
  for (const t of projTokens) if (avTokens.has(t)) overlap++;
  /** Dice coefficient normalized 0..1 then scaled 0..100. */
  const dice = (2 * overlap) / (projTokens.size + avTokens.size);
  return Math.round(dice * 100);
}

export interface AvatarSuggestion {
  avatarId: string;
  score: number;
}

export function topAvatarsForProject(
  candidates: readonly Avatar[],
  project: { title: string; summary?: string },
  k: number
): AvatarSuggestion[] {
  return candidates
    .map((a) => ({ avatarId: a.id, score: scoreAvatarForProject(a, project) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}
