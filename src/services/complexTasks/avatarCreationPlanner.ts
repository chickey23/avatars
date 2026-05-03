export type AvatarCreationPlanKind = "named_list" | "set_discovery";

export type AvatarCreationPlan = {
  kind: AvatarCreationPlanKind;
  projectTitle: string;
  originalRequest: string;
  subjects: string[];
  /** True when the plan came from implicit chat set discovery, not parseAvatarCreationPlan. */
  chatImplicitSetDiscovery?: boolean;
  discoveryQuery?: string;
  /**
   * Ordered Wikidata / search phrases (deduped). First entry is the primary
   * `discoveryQuery` shown in UI; extras are tried automatically for Wikidata
   * and rotated on "Search again" for legacy search.
   */
  discoverySearchQueries?: string[];
  planId: string;
};

const CREATE_AVATAR_RE =
  /\b(?:create|make|build|add)\s+(?:(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+)?(?:new\s+)?avatars?\b/i;

const NAMED_SEGMENT_RE =
  /\b(?:named|called)\s+(.+)$/i;

const SET_SEGMENT_RE =
  /\bfor\s+(?:the\s+)?(.+)$/i;

const FILLER_PREFIX_RE =
  /^(?:avatars?\s+)?(?:named|called|for)\s+/i;

const TRAILING_REQUEST_RE =
  /\b(?:please|thanks|thank you|using the workshop|with the workshop)\b.*$/i;

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function trimSubject(s: string): string {
  return normalizeSpaces(
    s
      .replace(/^["'`]+|["'`.!?]+$/g, "")
      .replace(FILLER_PREFIX_RE, "")
      .replace(TRAILING_REQUEST_RE, "")
  );
}

function splitSubjects(segment: string): string[] {
  const cleaned = segment
    .replace(/\([^)]*\)/g, "")
    .replace(/\band\b/gi, ",")
    .replace(/;/g, ",");
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of cleaned.split(",")) {
    const subject = trimSubject(part);
    if (!subject || subject.length < 2) continue;
    const key = subject.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(subject);
  }
  return out;
}

function requestedCount(input: string): number | undefined {
  const m = input.match(
    /\b(?:create|make|build|add)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:new\s+)?avatars?\b/i
  );
  if (!m) return undefined;
  const raw = m[1]!.toLowerCase();
  return /^\d+$/.test(raw) ? Number(raw) : NUMBER_WORDS[raw];
}

/** FNV-1a style hash for stable plan / project ids (also used by implicit set discovery). */
export function hashPlan(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48) || "avatar"
  );
}

export function avatarCreationProjectId(plan: AvatarCreationPlan): string {
  return `complex_avatar_${plan.planId}`;
}

export function avatarCreationTaskId(
  plan: AvatarCreationPlan,
  subject: string
): string {
  return `complex_avatar_${plan.planId}_${slugify(subject)}`;
}

export function avatarCreationSubjectSeed(
  plan: AvatarCreationPlan,
  subject: string
): { seedText: string; wikiQuery: string } {
  const trimmed = trimSubject(subject);
  return {
    seedText: `Create a named avatar for ${trimmed}. Source request: ${plan.originalRequest}`,
    wikiQuery: trimmed,
  };
}

/**
 * Normalize internet-discovery name strings using the same comma-splitting,
 * parenthetical stripping, and trim rules as named-list chat parsing.
 */
export function normalizeAvatarCreationSubjectNames(
  names: readonly string[]
): string[] {
  const joined = names
    .map((n) => n.trim())
    .filter(Boolean)
    .join(", ");
  if (!joined) return [];
  return splitSubjects(joined);
}

/** Fix rare chat typos that break Wikidata search (e.g. `eACh` → `each`). */
function normalizeDiscoveryTokenTypos(s: string): string {
  let t = normalizeSpaces(s);
  const first = t.match(/^(\S+)/);
  if (first && /^e.?a.?c.?h$/i.test(first[1]!) && first[1]!.length === 4) {
    t = `each ${t.slice(first[1]!.length).trim()}`;
  }
  return t;
}

/** Strip "members of …", "cast of …", etc. for cleaner entity search. */
export function stripDiscoveryBoilerplate(description: string): string {
  let s = normalizeDiscoveryTokenTypos(
    normalizeSpaces(description).replace(/\s+members\s+characters\s+list\s*$/i, "").trim()
  );
  const prefixes = [
    /^(?:each|every|all)\s+members?\s+of\s+(?:the\s+)?/i,
    /^(?:the\s+)?members?\s+of\s+(?:the\s+)?/i,
    /^(?:the\s+)?cast\s+of\s+(?:the\s+)?/i,
    /^(?:main\s+)?crew\s+of\s+(?:the\s+)?/i,
    /^(?:the\s+)?characters?\s+(?:in|from)\s+(?:the\s+)?/i,
  ];
  for (const p of prefixes) {
    const next = s.replace(p, "").trim();
    if (next.length >= 2) s = next;
  }
  s = s.replace(/^the\s+/i, "").trim();
  return s.length >= 2 ? s : normalizeSpaces(description).trim();
}

/**
 * Exact-match (lowercase) extra discovery bases for common misspellings.
 * Keys are normalized with normalizeSpaces + toLowerCase.
 */
const DISCOVERY_BASE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  aenir: ["æsir", "aesir mythology"],
  aesir: ["æsir", "aesir mythology"],
};

/**
 * Bases for Wikidata/search: stripped description plus, when the phrase is
 * "Team from Show", separate show + team queries.
 */
export function discoverySearchBases(setDescription: string): string[] {
  const core = stripDiscoveryBoilerplate(setDescription);
  const bases: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const t = normalizeSpaces(q).trim();
    if (t.length < 2) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    bases.push(t);
  };
  add(core);

  const coreLower = core.toLowerCase();
  const aliasBases = DISCOVERY_BASE_ALIASES[coreLower];
  if (aliasBases) {
    for (const b of aliasBases) add(b);
  }

  const familyM = core.match(/^(.{3,40})\s+family$/i);
  if (familyM) {
    const stem = familyM[1]!.trim();
    if (stem.length >= 3) {
      const titled = `The ${stem}`;
      add(titled);
      if (stem.toLowerCase() !== coreLower) add(stem);
    }
  }

  const fromM = core.match(/^(.{2,120}?)\s+from\s+(.{2,120})$/i);
  if (fromM) {
    const team = fromM[1]!.trim();
    const show = fromM[2]!.trim();
    add(team);
    add(show);
    add(`${show} ${team}`);
    add(`${team} (${show})`);
  }
  return bases;
}

/** Max phrases sent to Wikidata + legacy discovery per plan (cost / UX cap). */
export const MAX_DISCOVERY_QUERIES = 10;

/**
 * Full discovery query list for Wikidata + legacy search. Prefer recomputing from
 * `projectTitle` / `originalRequest` so payloads stored on chat actions (which may
 * omit `discoverySearchQueries`) still get neutral + suffix expansions.
 */
export function discoveryQueriesForPlan(plan: AvatarCreationPlan): string[] {
  const fromTitle = plan.projectTitle
    .match(/^Create avatars for\s+(.+)$/i)?.[1]
    ?.trim();
  const seed = normalizeSpaces(
    fromTitle || plan.discoveryQuery || plan.originalRequest
  );
  if (!seed) return [];
  return buildSetDiscoverySearchQueries(seed);
}

type DiscoveryHint = "myth" | "media_explicit";

/** Lightweight keyword gates for suffix ordering (not a full classifier). */
export function discoveryHintCategories(seed: string): Set<DiscoveryHint> {
  const s = seed.toLowerCase();
  const out = new Set<DiscoveryHint>();
  if (
    /\b(myth|mythology|pantheon|aesir|æsir|vanir|asgard|olymp|deit(y|ies)|goddess|gods?\b|norse|greek myth|roman myth)\b/i.test(
      seed
    )
  ) {
    out.add("myth");
  }
  if (
    /\b(film|movie|cinema|tv\b|television|television series|\bseries\b|episode|showrunner|show\b|video game|videogame|game console|playstation|xbox|nintendo|\brpg\b|mmorpg|comic|graphic novel|marvel\b|dc\b|anime|manga|novel\b|book series|literature|novella)\b/i.test(
      s
    )
  ) {
    out.add("media_explicit");
  }
  return out;
}

/**
 * Ordered optional suffixes (second segment after base). See docs/DISCOVERY_SEARCH_PROMPTS.md.
 * Defaults favor prominence / time / fame; media-type suffixes only when the seed explicitly names a medium.
 */
export function buildDiscoverySuffixPool(seed: string): string[] {
  const hints = discoveryHintCategories(seed);
  const pool: string[] = [];
  const add = (x: string) => {
    if (!pool.includes(x)) pool.push(x);
  };
  if (hints.has("myth")) {
    add("mythology");
    add("fictional character");
  }
  if (hints.has("media_explicit")) {
    add("television series");
    add("film");
    add("video game");
    add("comics");
    add("novel");
    add("animated series");
  }
  for (const s of [
    "well-known",
    "popular",
    "famous",
    "legendary",
    "classic",
    "ancient",
    "historical",
    "original",
    "contemporary",
    "recent",
    "fictional character",
    "mythology",
  ]) {
    add(s);
  }
  return pool;
}

/** Build search phrases: all bases first, then primary-base + suffix pool (capped). */
export function buildSetDiscoverySearchQueries(setDescription: string): string[] {
  const bases = discoverySearchBases(setDescription);
  const seed = setDescription.trim();
  const suffixes = buildDiscoverySuffixPool(seed);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (q: string) => {
    const t = normalizeSpaces(q).trim();
    if (t.length < 2) return;
    const k = t.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  };

  for (const base of bases.slice(0, 4)) {
    push(base);
    if (out.length >= MAX_DISCOVERY_QUERIES) return out;
  }

  const primary = bases[0];
  if (primary) {
    for (const suf of suffixes) {
      push(`${primary} ${suf}`);
      if (out.length >= MAX_DISCOVERY_QUERIES) return out;
    }
  }

  for (const base of bases.slice(1, 4)) {
    if (!base || base === primary) continue;
    push(`${base} fictional character`);
    if (out.length >= MAX_DISCOVERY_QUERIES) return out;
  }

  return out;
}

export function parseAvatarCreationPlan(
  request: string
): AvatarCreationPlan | null {
  const originalRequest = normalizeSpaces(request);
  if (!CREATE_AVATAR_RE.test(originalRequest)) return null;

  const named = originalRequest.match(NAMED_SEGMENT_RE);
  if (named) {
    const subjects = splitSubjects(named[1]!);
    if (subjects.length > 0) {
      const count = requestedCount(originalRequest);
      const projectTitle =
        count && count !== subjects.length
          ? `Create ${subjects.length} named avatars`
          : `Create avatars: ${subjects.join(", ")}`;
      return {
        kind: "named_list",
        projectTitle,
        originalRequest,
        subjects,
        planId: hashPlan(`${originalRequest}|${subjects.join("|")}`),
      };
    }
  }

  const setMatch = originalRequest.match(SET_SEGMENT_RE);
  const setDescription = setMatch ? trimSubject(setMatch[1]!) : "";
  if (setDescription && setDescription.includes(",")) {
    const subjects = splitSubjects(setDescription);
    if (subjects.length > 0) {
      return {
        kind: "named_list",
        projectTitle: `Create avatars: ${subjects.join(", ")}`,
        originalRequest,
        subjects,
        planId: hashPlan(`${originalRequest}|${subjects.join("|")}`),
      };
    }
  }
  if (setDescription) {
    const discoverySearchQueries = buildSetDiscoverySearchQueries(setDescription);
    const discoveryQuery = discoverySearchQueries[0] ?? setDescription;
    return {
      kind: "set_discovery",
      projectTitle: `Create avatars for ${setDescription}`,
      originalRequest,
      subjects: [],
      discoveryQuery,
      discoverySearchQueries,
      planId: hashPlan(`${originalRequest}|${setDescription}`),
    };
  }

  return null;
}
