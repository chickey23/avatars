export type AvatarCreationPlanKind = "named_list" | "set_discovery";

export type AvatarCreationPlan = {
  kind: AvatarCreationPlanKind;
  projectTitle: string;
  originalRequest: string;
  subjects: string[];
  discoveryQuery?: string;
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

function hashPlan(input: string): string {
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
    return {
      kind: "set_discovery",
      projectTitle: `Create avatars for ${setDescription}`,
      originalRequest,
      subjects: [],
      discoveryQuery: `${setDescription} members characters list`,
      planId: hashPlan(`${originalRequest}|${setDescription}`),
    };
  }

  return null;
}
