/**
 * Implicit chat intent: user asks for a roster / cast / members without using
 * create|build|make|add … avatars (see parseAvatarCreationPlan). Produces the
 * same set_discovery AvatarCreationPlan shape for the complex-task planner.
 */

import type { AvatarCreationPlan } from "./avatarCreationPlanner";
import {
  buildSetDiscoverySearchQueries,
  hashPlan,
  stripDiscoveryBoilerplate,
} from "./avatarCreationPlanner";

const IMPLICIT_MARKER = "implicit_set_v1";

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Obvious non-fiction / tooling asks — do not treat as fictional set discovery. */
const NEGATIVE_LINE_RE =
  /@|https?:\/\/|\b(?:email|inbox|summarize|summarise|calendar|meeting|agenda|ticket|jira|linear|github|commit|pull request|pr\b|deploy|build failed|error log)\b/i;

const POLITICAL_OR_CORP_RE =
  /\b(?:senate|congress|parliament|house of representatives|supreme court|shareholders?\s+meeting|board\s+of\s+directors)\b/i;

/**
 * "… cast|characters|members|crew|… of|in|from The X"
 * Allows a short lead-in ("What's the cast of …").
 */
const ROSTER_OF_RE =
  /^[\s\S]{0,240}?\b(?:the\s+)?(?:main\s+)?(?:cast|characters?|members?|crew|ensemble|roster)\s+(?:of|in|from)\s+(?:the\s+)?(.+)$/i;

/**
 * "Who's / who is / who are … in|on The X"
 */
const WHO_IN_RE =
  /^[\s\S]{0,240}?\bwho(?:'|’|s|\s+is|\s+are|\s+was|\s+were)\s+(?:in|on)\s+(?:the\s+)?(.+)$/i;

/**
 * "List the characters of …"
 */
const LIST_ROSTER_RE =
  /^[\s\S]{0,240}?\b(?:please\s+)?(?:list|name)\s+(?:the\s+)?(?:main\s+)?(?:cast|characters?|members?)\s+(?:of|in|from)\s+(?:the\s+)?(.+)$/i;

/**
 * "states of the US", "provinces of Canada"
 */
const STATES_OF_RE =
  /^[\s\S]{0,240}?\b(?:the\s+)?(?:states?|provinces?|regions?)\s+of\s+(?:the\s+)?(.+)$/i;

/**
 * "parts of a car", "components of the ship"
 */
const PARTS_OF_RE =
  /^[\s\S]{0,240}?\b(?:the\s+)?(?:parts?|pieces?|components?)\s+of\s+(?:the\s+)?(.+)$/i;

/**
 * "list of X" / "give me a list of X" (fictional rosters, geographic sets, etc.)
 */
const LIST_OF_RE =
  /^[\s\S]{0,240}?\b(?:please\s+)?(?:list|give\s+me\s+a\s+list)\s+of\s+(?:the\s+)?(.+)$/i;

/** With generic "list of …", avoid obvious work / tooling asks. */
const LIST_OF_LINE_TOOLING_RE =
  /\b(tasks?|commits?|pull\s*requests?|issues?|tickets?|errors?|emails?|meetings?|repositories?)\b/i;

function extractSeed(content: string): string | null {
  const line = normalizeSpaces(content);
  if (line.length < 12) return null;
  if (NEGATIVE_LINE_RE.test(line)) return null;

  const rosterRes = [ROSTER_OF_RE, WHO_IN_RE, LIST_ROSTER_RE, STATES_OF_RE, PARTS_OF_RE, LIST_OF_RE];
  for (const re of rosterRes) {
    const m = line.match(re);
    if (!m?.[1]) continue;
    if (re === LIST_OF_RE && LIST_OF_LINE_TOOLING_RE.test(line)) continue;
    let seed = normalizeSpaces(m[1]!.replace(/^["'`]+|["'`.!?]+$/g, ""));
    seed = stripDiscoveryBoilerplate(seed);
    seed = normalizeSpaces(seed);
    if (seed.length < 2 || seed.length > 200) continue;
    if (POLITICAL_OR_CORP_RE.test(seed)) continue;
    return seed;
  }
  return null;
}

/**
 * When the user did not use explicit avatar-creation wording, but asked for a
 * cast / roster / "who's in …" style answer, return a set_discovery plan.
 * Call only if `parseAvatarCreationPlan` already returned null.
 */
export function parseImplicitSetDiscoveryPlan(content: string): AvatarCreationPlan | null {
  const originalRequest = normalizeSpaces(content);
  const seed = extractSeed(originalRequest);
  if (!seed) return null;

  const discoverySearchQueries = buildSetDiscoverySearchQueries(seed);
  const discoveryQuery = discoverySearchQueries[0] ?? seed;
  const planId = hashPlan(`${originalRequest}|${seed}|${IMPLICIT_MARKER}`);

  return {
    kind: "set_discovery",
    projectTitle: `Create avatars for ${seed}`,
    originalRequest,
    subjects: [],
    discoveryQuery,
    discoverySearchQueries,
    planId,
    chatImplicitSetDiscovery: true,
  };
}
