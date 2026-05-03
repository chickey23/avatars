import type { AvatarCreationPlan } from "./avatarCreationPlanner";
import type { DiscoverSetMembersResult } from "./avatarCreationDiscovery";
import { generateWithOllama, getOllamaPresence } from "../ollama";
import { appendSessionLog } from "../sessionLog";
import { contractLog } from "../sessionLog/contractLog";

/** Max character names returned from one Ollama suggestion pass. */
export const MAX_OLLAMA_SET_MEMBERS = 18;

const OLLAMA_SUGGEST_LOG = "set_discovery_ollama";

export type OllamaSuggestParsed = {
  work?: string;
  members: string[];
  notes?: string;
};

function hashSeed(s: string): string {
  let h = 0;
  for (let i = 0; i < Math.min(s.length, 200); i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return String(h);
}

/** Strip optional ```json fences and take the outermost JSON object. */
export function extractOllamaJsonObject(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/im.exec(t);
  const inner = fence ? fence[1]!.trim() : t;
  const start = inner.indexOf("{");
  const end = inner.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return inner.slice(start, end + 1);
}

export function parseOllamaSetMemberJson(raw: string): OllamaSuggestParsed | null {
  const jsonStr = extractOllamaJsonObject(raw);
  if (!jsonStr) return null;
  let v: unknown;
  try {
    v = JSON.parse(jsonStr) as unknown;
  } catch {
    return null;
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const work = typeof o.work === "string" ? o.work.trim() : undefined;
  const notes = typeof o.notes === "string" ? o.notes.trim() : undefined;
  const rawMembers = o.members;
  if (!Array.isArray(rawMembers)) return null;
  const members: string[] = [];
  const seen = new Set<string>();
  for (const item of rawMembers) {
    if (typeof item !== "string") continue;
    const n = item.replace(/\s+/g, " ").trim();
    if (n.length < 2 || n.length > 120) continue;
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    members.push(n);
    if (members.length >= MAX_OLLAMA_SET_MEMBERS) break;
  }
  if (members.length === 0) return null;
  return { work: work || undefined, members, notes: notes || undefined };
}

function buildPrompt(plan: AvatarCreationPlan, seed: string): string {
  const title = plan.projectTitle?.trim() || plan.originalRequest.trim();
  return `You help disambiguate fictional "sets" of characters for an offline avatar app.

User request (context): ${title}
Discovery seed (what to list members for): ${seed}

Return ONLY valid JSON (no markdown, no commentary) with this exact shape:
{"work":"canonical work title if inferable, else empty string","members":["Name1","Name2"],"notes":"optional short disambiguation"}

Rules:
- "members" must be **fictional characters** (people/creatures/roles) that belong to that set — not episode titles, seasons, studios, or real actors unless the user asked for actors.
- Prefer the main recurring cast or the specific group named in the seed (e.g. "Simpson family" → Homer, Marge, Bart, Lisa, Maggie, …).
- Use the common English display names as a fan would write them.
- At most ${MAX_OLLAMA_SET_MEMBERS} names; fewer is fine if unsure.
- If the seed is ambiguous, put your best guess in "work" and explain briefly in "notes".
`.trim();
}

/**
 * Calls local Ollama to suggest set member names. Always review before creating avatars.
 */
export async function suggestSetMembersWithOllama(
  plan: AvatarCreationPlan,
  opts?: { seed?: string }
): Promise<DiscoverSetMembersResult> {
  const presence = await getOllamaPresence();
  if (presence !== "ready") {
    appendSessionLog(OLLAMA_SUGGEST_LOG, "skip_not_ready", {
      level: "info",
      detail: presence,
    });
    return {
      names: [],
      sourceLines: [],
      notices: [`ollama_not_ready:${presence}`],
    };
  }

  const seed =
    opts?.seed?.trim() ||
    (plan.discoveryQuery ?? plan.originalRequest).trim() ||
    plan.projectTitle.trim();

  const prompt = buildPrompt(plan, seed);
  const seedHash = hashSeed(seed);

  contractLog(
    "complex_task_planner",
    "ollama_suggest_started",
    `seedHash=${seedHash}`,
    { level: "info" }
  );

  const gen = await generateWithOllama({ prompt });
  if (!gen.ok) {
    appendSessionLog(OLLAMA_SUGGEST_LOG, "generate_failed", {
      level: "warn",
      detail: gen.error,
    });
    contractLog("complex_task_planner", "ollama_suggest_failed", gen.error, {
      level: "warn",
    });
    return {
      names: [],
      sourceLines: [`notice: ollama_generate_failed`, gen.error],
      notices: ["ollama_generate_failed"],
    };
  }

  const parsed = parseOllamaSetMemberJson(gen.text);
  if (!parsed) {
    appendSessionLog(OLLAMA_SUGGEST_LOG, "parse_failed", {
      level: "warn",
      detail: `seedHash=${seedHash} preview=${gen.text.slice(0, 120)}`,
    });
    contractLog(
      "complex_task_planner",
      "ollama_suggest_parse_failed",
      `seedHash=${seedHash}`,
      { level: "warn" }
    );
    return {
      names: [],
      sourceLines: ["notice: ollama_json_unparsed", gen.text.slice(0, 400)],
      notices: ["ollama_parse_failed"],
    };
  }

  appendSessionLog(OLLAMA_SUGGEST_LOG, "ok", {
    level: "info",
    detail: JSON.stringify({
      seedHash,
      count: parsed.members.length,
      work: parsed.work ?? "",
    }),
  });
  contractLog(
    "complex_task_planner",
    "ollama_suggest_ok",
    `names=${parsed.members.length} seedHash=${seedHash}`,
    { level: "info" }
  );

  const sourceLines: string[] = ["notice: ollama_suggested"];
  if (parsed.work) sourceLines.push(`work: ${parsed.work}`);
  if (parsed.notes) sourceLines.push(`notes: ${parsed.notes}`);

  return {
    names: parsed.members,
    sourceLines,
    notices: ["ollama_suggested"],
  };
}
