/**
 * Parse optional `avatars_tools_v1` JSON from the end of an Ollama reply.
 */

export const WORLDVIEW_TOOLS_SCHEMA = "avatars_tools_v1" as const;

export type WorldviewToolCall = {
  name: string;
  args: Record<string, unknown>;
};

export type WorldviewToolsEnvelope = {
  schema: typeof WORLDVIEW_TOOLS_SCHEMA;
  tools: WorldviewToolCall[];
};

const FENCE =
  /```(?:json)?\s*([\s\S]*?)```/gi;

/**
 * Models often put project id → fields directly under `args` instead of `args.patch`.
 * Lift that shape so execute.ts sees `args.patch`.
 */
function normalizeProjectPatchArgs(
  args: Record<string, unknown>
): Record<string, unknown> {
  const p = args.patch;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    return args;
  }
  const keys = Object.keys(args).filter((k) => k !== "patch");
  if (keys.length === 0) return args;
  const allMapLike = keys.every((k) => {
    const v = args[k];
    return (
      v === null || (typeof v === "object" && v !== null && !Array.isArray(v))
    );
  });
  if (!allMapLike) return args;
  const patch: Record<string, unknown> = {};
  for (const k of keys) {
    patch[k] = args[k];
  }
  return { patch };
}

/** Some models emit `{ schema, name, args }` instead of `{ schema, tools: [...] }`. */
function maybeLiftFlatToolShape(
  parsed: Record<string, unknown>
): Record<string, unknown> | null {
  if (parsed.schema !== WORLDVIEW_TOOLS_SCHEMA) return null;
  if (Array.isArray(parsed.tools)) return null;
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  if (!name) return null;
  const rawArgs = parsed.args;
  const args =
    rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
      ? (rawArgs as Record<string, unknown>)
      : {};
  return {
    schema: WORLDVIEW_TOOLS_SCHEMA,
    tools: [{ name, args }],
  };
}

function normalizeEnvelope(parsed: Record<string, unknown>): WorldviewToolsEnvelope | null {
  const lifted = maybeLiftFlatToolShape(parsed);
  const p = lifted ?? parsed;
  if (p.schema !== WORLDVIEW_TOOLS_SCHEMA) return null;
  const tools = p.tools;
  if (!Array.isArray(tools)) return null;
  const normalized: WorldviewToolCall[] = [];
  for (const t of tools) {
    if (!t || typeof t !== "object") continue;
    const to = t as Record<string, unknown>;
    const name = typeof to.name === "string" ? to.name : "";
    if (!name) continue;
    let args =
      to.args && typeof to.args === "object"
        ? (to.args as Record<string, unknown>)
        : {};
    if (name === "world_metadata.patch_projects") {
      args = normalizeProjectPatchArgs(args);
    }
    normalized.push({ name, args });
  }
  return { schema: WORLDVIEW_TOOLS_SCHEMA, tools: normalized };
}

/** Exported for diagnostics / tests (same as internal envelope parse). */
export function tryParseWorldviewEnvelopeJson(
  text: string
): WorldviewToolsEnvelope | null {
  return tryParseEnvelopeJson(text);
}

/** Curly double/single quotes models sometimes emit instead of ASCII quotes. */
function loosenJsonQuotes(s: string): string {
  return s
    .replace(/\u201c|\u201d|\u201e|\u00ab|\u00bb/g, '"')
    .replace(/\u2018|\u2019|\u02bc/g, "'");
}

/** Take substring from first `{` through last `}` (repair trailing prose / bad fences). */
function extractOuterJsonObject(s: string): string | null {
  const t = s.trim();
  const start = t.indexOf("{");
  if (start < 0) return null;
  const end = t.lastIndexOf("}");
  if (end < start) return null;
  return t.slice(start, end + 1);
}

/** Only slice `{`…`}` when there is no non‑whitespace prose before the first `{` (avoid eating trailing JSON from chat). */
function onlyWhitespaceBeforeFirstBrace(s: string): boolean {
  const t = s.trim();
  const i = t.indexOf("{");
  if (i < 0) return false;
  return t.slice(0, i).trim() === "";
}

/**
 * Normalize common model slips before JSON.parse (smart quotes handled separately).
 */
export function preprocessToolReplyText(raw: string): string {
  let t = raw.replace(/\r\n/g, "\n");
  /** `**json**` section headers → markdown fence start */
  t = t.replace(/\n\*\*json\*\*\s*\n/gi, "\n```json\n");
  /** Missing opening quote before `args":` */
  t = t.replace(/([,{]\s*)args"\s*:/g, '$1"args":');
  t = t.replace(/,\s*args"\s*:/g, ',"args":');
  t = t.replace(/^\s*args"\s*:/gm, '"args":');
  return t;
}

function tryParseEnvelopeJson(text: string): WorldviewToolsEnvelope | null {
  const t0 = preprocessToolReplyText(text.trim());
  const t1 = loosenJsonQuotes(t0);
  const candidates: string[] = [];
  const push = (c: string | undefined) => {
    if (!c || candidates.includes(c)) return;
    candidates.push(c);
  };
  push(t0);
  if (t1 !== t0) push(t1);
  for (const c of [t0, t1]) {
    if (!c) continue;
    const braceSrc = loosenJsonQuotes(c);
    if (!onlyWhitespaceBeforeFirstBrace(braceSrc)) continue;
    const slice = extractOuterJsonObject(braceSrc);
    if (slice) push(slice);
  }
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c) as unknown;
      if (!parsed || typeof parsed !== "object") continue;
      const env = normalizeEnvelope(parsed as Record<string, unknown>);
      if (env) return env;
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Models often omit markdown fences and append raw JSON. Find the last `{` such that
 * the suffix parses as JSON (try from last `{` backward).
 */
function extractTrailingJsonBlob(raw: string): { start: number; json: string } | null {
  const t = raw.trimEnd();
  if (!t.length) return null;
  for (let start = t.lastIndexOf("{"); start >= 0; start = t.lastIndexOf("{", start - 1)) {
    const json = t.slice(start);
    try {
      JSON.parse(json);
      return { start, json };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Clean model output for chat: orphan ``` / ```json fences, trailing "json", and a single
 * outer JSON-string wrapper (`"hello"` → hello).
 */
export function sanitizeAvatarVisibleReply(text: string): string {
  let t = text.trim();
  if (!t) return "";

  for (let i = 0; i < 6; i++) {
    const next = t
      .replace(/^\s*```(?:json)?\s*/i, "")
      .replace(/\s*```(?:json)?\s*$/i, "")
      .replace(/[ \t]+```(?:json)?\s*$/i, "");
    if (next === t) break;
    t = next.trim();
  }

  const lines = t.split(/\r?\n/);
  while (lines.length > 0) {
    const L = lines[lines.length - 1]!.trim();
    if (L === "") {
      lines.pop();
      continue;
    }
    if (/^```(?:json)?$/i.test(L) || /^json$/i.test(L)) {
      lines.pop();
      continue;
    }
    break;
  }
  t = lines.join("\n").trimEnd();

  t = t.replace(/\n```(?:json)?\s*$/i, "").trim();
  t = t.replace(/[ \t]*```(?:json)?\s*$/i, "").trim();

  t = unwrapOuterJsonStringQuotes(t);

  return t.trim();
}

function unwrapOuterJsonStringQuotes(s: string): string {
  let out = s;
  for (let d = 0; d < 4; d++) {
    const u = out.trim();
    if (u.length < 2 || u[0] !== '"') break;
    try {
      const parsed = JSON.parse(u);
      if (typeof parsed !== "string") break;
      out = parsed;
    } catch {
      break;
    }
  }
  return out;
}

/**
 * Extract visible reply text (fences containing worldview tools removed) and parsed tools.
 */
export function splitWorldviewToolsFromReply(raw: string): {
  visible: string;
  envelope: WorldviewToolsEnvelope | null;
} {
  const rawNormalized = preprocessToolReplyText(raw);
  let envelope: WorldviewToolsEnvelope | null = null;
  const fences: Array<{ full: string; inner: string }> = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(FENCE.source, FENCE.flags);
  while ((m = re.exec(rawNormalized)) !== null) {
    fences.push({ full: m[0], inner: m[1]?.trim() ?? "" });
  }
  let stripped = rawNormalized;
  /** Prefer last ``` fence: models often emit an earlier invalid `json` block, then tools at the end. */
  for (const { full, inner } of [...fences].reverse()) {
    const parsed = tryParseEnvelopeJson(inner);
    if (!parsed) continue;
    envelope = parsed;
    stripped = stripped.replace(full, "").trim();
    break;
  }

  if (!envelope) {
    const whole = tryParseEnvelopeJson(rawNormalized.trim());
    if (whole) {
      return { visible: sanitizeAvatarVisibleReply(""), envelope: whole };
    }
    const tail = extractTrailingJsonBlob(rawNormalized);
    if (tail) {
      const parsed = tryParseEnvelopeJson(tail.json);
      if (parsed) {
        envelope = parsed;
        stripped = rawNormalized.slice(0, tail.start).trimEnd();
      }
    }
  }

  if (envelope) {
    return { visible: sanitizeAvatarVisibleReply(stripped), envelope };
  }
  return { visible: sanitizeAvatarVisibleReply(rawNormalized), envelope: null };
}
