import { getWorldMetadata } from "../worldMetadata/store";
import type { WorldviewToolCall } from "../worldviewTools/parse";

/**
 * Strip markdown fenced blocks so tool-like prose inside fences does not parse as lexical tools.
 */
export function stripMarkdownFencedBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, "").trim();
}

const MEM_PREFIX = /^AVATARS_MEM:\s*(.*)$/i;
const TOOL_LINE =
  /^AVATARS_TOOL\s+name=gmail\.fetch_message_body\s+messageId=(\S+)\s*$/i;

const INLINE_MEM = /^(.*?)\b(AVATARS_MEM:\s*)(.+)$/i;
const INLINE_FETCH =
  /^(.*?)(\bAVATARS_TOOL\s+name=gmail\.fetch_message_body\s+messageId=\S+)\s*$/i;

/**
 * Move inline `AVATARS_MEM:` / `AVATARS_TOOL …` to their own lines so line-based parsing applies.
 * `body` should already be fence-stripped when possible; callers may pass raw reply (fences removed here via stripMarkdownFencedBlocks in parseLexicalAgenticLines).
 */
export function hoistInlineLexicalLines(body: string): string {
  const lines = body.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      out.push(line);
      continue;
    }
    const memFull = MEM_PREFIX.exec(t);
    if (memFull && memFull[0] === t) {
      out.push(t);
      continue;
    }
    const fetchFull = TOOL_LINE.exec(t);
    if (fetchFull && fetchFull[0] === t) {
      out.push(t);
      continue;
    }
    const m = INLINE_MEM.exec(t);
    if (m) {
      const prose = (m[1] ?? "").trimEnd();
      const rest = (m[3] ?? "").trim();
      if (prose) out.push(prose);
      out.push(`AVATARS_MEM: ${rest}`);
      continue;
    }
    const f = INLINE_FETCH.exec(t);
    if (f) {
      const prose = (f[1] ?? "").trimEnd();
      const tool = (f[2] ?? "").trim();
      if (prose) out.push(prose);
      out.push(tool);
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

/**
 * Remove lexical tool syntax from visible chat (whole-line and inline suffixes).
 */
export function stripLexicalToolSyntaxFromVisible(text: string): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      out.push("");
      continue;
    }
    if (MEM_PREFIX.exec(t)?.[0] === t) {
      out.push("");
      continue;
    }
    if (TOOL_LINE.exec(t)?.[0] === t) {
      out.push("");
      continue;
    }
    const m = INLINE_MEM.exec(t);
    if (m) {
      const prose = (m[1] ?? "").trimEnd();
      out.push(prose);
      continue;
    }
    const f = INLINE_FETCH.exec(t);
    if (f) {
      const prose = (f[1] ?? "").trimEnd();
      out.push(prose);
      continue;
    }
    out.push(line);
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Detect lines that look like lexical tools but are not valid (for wave `tool_error` + session log).
 */
export function scanLexicalMalformedTriggers(raw: string): string[] {
  const issues: string[] = [];
  const body = stripMarkdownFencedBlocks(raw);
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (/\bAVATARS_MEM\b/i.test(t)) {
      const memFull = MEM_PREFIX.exec(t);
      if (memFull && memFull[0] === t) {
        const bodyPart = (memFull[1] ?? "").trim();
        if (!bodyPart) issues.push("AVATARS_MEM with empty body");
        continue;
      }
      if (INLINE_MEM.test(t)) continue;
      issues.push("Malformed AVATARS_MEM (expected AVATARS_MEM: … on its own line or at end of prose)");
      continue;
    }
    if (/\bAVATARS_TOOL\b/i.test(t)) {
      const fetchFull = TOOL_LINE.exec(t);
      if (fetchFull && fetchFull[0] === t) continue;
      if (INLINE_FETCH.test(t)) continue;
      issues.push("Malformed AVATARS_TOOL (expected exact gmail.fetch_message_body line)");
    }
  }
  return issues;
}

/**
 * Parse line-based agentic tools (alternative to `avatars_tools_v1` JSON).
 * - `AVATARS_MEM: text` — append to user profile notes (merged with existing notes in-store at parse time).
 * - `AVATARS_TOOL name=gmail.fetch_message_body messageId=<id>` — fetch Gmail body (same as JSON tool).
 *
 * Inline `… AVATARS_MEM: note` and trailing fetch lines are hoisted to dedicated lines first.
 */
export function parseLexicalAgenticLines(raw: string): WorldviewToolCall[] {
  const stripped = stripMarkdownFencedBlocks(raw);
  const hoisted = hoistInlineLexicalLines(stripped);
  const lines = hoisted.split(/\r?\n/);
  const memFragments: string[] = [];
  const out: WorldviewToolCall[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const mem = MEM_PREFIX.exec(t);
    if (mem) {
      const body = (mem[1] ?? "").trim();
      if (body) memFragments.push(body);
      continue;
    }
    const fetch = TOOL_LINE.exec(t);
    if (fetch) {
      const messageId = fetch[1]!;
      out.push({
        name: "gmail.fetch_message_body",
        args: { messageId },
      });
    }
  }

  if (memFragments.length > 0) {
    const prev = getWorldMetadata().userProfile.notes?.trim() ?? "";
    const addition = memFragments.join("\n\n");
    const notes = prev ? `${prev}\n\n${addition}` : addition;
    out.unshift({
      name: "user_profile.patch",
      args: { patch: { notes } },
    });
  }

  return out;
}

export function dedupeWorldviewToolCalls(tools: WorldviewToolCall[]): WorldviewToolCall[] {
  const seen = new Set<string>();
  const result: WorldviewToolCall[] = [];
  for (const t of tools) {
    const key = `${t.name}:${JSON.stringify(t.args)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(t);
  }
  return result;
}
