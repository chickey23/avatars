/**
 * Heuristics for direct address (vocative) vs incidental mention in switchboard routing.
 */

import type { Avatar } from "../types";

/** Bonus added to literal routing score when user directly addresses by givenName or @processName. */
export const ADDRESS_TIER_A_BONUS = 60;
/** Bonus when user addresses by a distinctive appellation token (Tier B). */
export const ADDRESS_TIER_BONUS = 50;

const MAX_VOCATIVE_HEAD = 120;

/** Words blocked from Tier B appellation-token matching only (not topic routing). */
const TITLE_TOKEN_BLOCKLIST = new Set([
  "general",
  "loyal",
  "ally",
  "the",
  "and",
  "of",
  "a",
  "an",
  "to",
  "in",
  "for",
  "with",
  "from",
  "by",
  "or",
  "as",
  "at",
  "on",
  "is",
  "it",
  "muse",
  "poetry",
  "eloquence",
  "philosopher",
]);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when `phraseLower` appears in an address-like position (vocative), not buried in prose.
 */
export function looksLikeDirectAddress(content: string, phraseLower: string): boolean {
  const phrase = phraseLower.trim().toLowerCase();
  if (phrase.length < 2) return false;
  const s = content.toLowerCase();
  if (!s.includes(phrase)) return false;

  const esc = escapeRegex(phrase);
  // After trim, message starts with phrase then punctuation, more words, or end.
  const atMsgStart = new RegExp(`^\\s*${esc}(?:\\s*[,\\!:]\\s|\\s+|$)`);
  if (atMsgStart.test(s)) return true;

  // Any line starting with vocative (after newline).
  for (const rawLine of s.split("\n")) {
    const line = rawLine.trimStart();
    if (line.length === 0) continue;
    const atLineStart = new RegExp(`^${esc}(?:\\s*[,\\!:]\\s|\\s+|$)`);
    if (atLineStart.test(line)) return true;
  }

  // Early in message: "Name," or "Name:" within first MAX_VOCATIVE_HEAD chars.
  const head = s.slice(0, MAX_VOCATIVE_HEAD);
  const earlyComma = new RegExp(`\\b${esc}\\b\\s*[,:]`);
  if (earlyComma.test(head)) return true;

  return false;
}

/** @processName is always treated as intentional address. */
export function looksLikeProcessMention(contentLower: string, processName: string): boolean {
  const p = processName.trim().toLowerCase();
  if (p.length < 2) return false;
  return contentLower.includes(`@${p}`);
}

/**
 * Tokens from appellation suitable for Tier B (distinctive; blocklist excludes "general" etc.).
 */
export function distinctiveAppellationTokens(appellation: string): string[] {
  const out: string[] = [];
  const segments = appellation.split(/[,;]+/);
  for (const seg of segments) {
    const words = seg
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3);
    for (const w of words) {
      if (TITLE_TOKEN_BLOCKLIST.has(w)) continue;
      out.push(w);
    }
  }
  return out;
}

/**
 * Address tier for sorting and literal bonus: 2 = Tier A (name / @process), 1 = Tier B (title token), 0 = none.
 */
export function getAddressTier(avatar: Avatar, contentLower: string): 0 | 1 | 2 {
  if (looksLikeProcessMention(contentLower, avatar.processName)) {
    return 2;
  }
  const given = avatar.givenName.trim().toLowerCase();
  if (given.length >= 2 && looksLikeDirectAddress(contentLower, given)) {
    return 2;
  }
  for (const token of distinctiveAppellationTokens(avatar.appellation)) {
    if (looksLikeDirectAddress(contentLower, token)) {
      return 1;
    }
  }
  return 0;
}

export function addressTierBonus(tier: 0 | 1 | 2): number {
  if (tier === 2) return ADDRESS_TIER_A_BONUS;
  if (tier === 1) return ADDRESS_TIER_BONUS;
  return 0;
}
