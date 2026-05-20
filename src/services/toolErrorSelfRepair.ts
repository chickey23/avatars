/**
 * Phase D1: single-attempt repair for schema-valid tool calls with missing required args.
 */

import type { WorldviewToolCall } from "./worldviewTools/parse";
import type { WorldviewToolExecutionResult } from "./worldviewTools/execute";
import { extractAvatarCreationQuery } from "./avatarCreationQueryExtract";

export type ToolErrorClass =
  | "missing_required_args"
  | "permission_denied"
  | "other";

export type MissingArgRepairLineage = "initial" | "repair_missing_args" | "final_status";

const MISSING_ARG_PATTERNS: { tool: string; errorRe: RegExp; fields: string[] }[] = [
  {
    tool: "avatars.workshop.open_draft",
    errorRe: /missing seedText and wikiQuery/i,
    fields: ["seedText", "wikiQuery"],
  },
  {
    tool: "drafts.tasks",
    errorRe: /missing projectId or title/i,
    fields: ["projectId", "title"],
  },
  {
    tool: "drafts.calendar_event",
    errorRe: /missing title or startAt/i,
    fields: ["title", "startAt"],
  },
  {
    tool: "drafts.email_reply",
    errorRe: /missing body or to/i,
    fields: ["body", "to"],
  },
];

export function classifyToolError(error: string | undefined): ToolErrorClass {
  const e = (error ?? "").trim();
  if (!e) return "other";
  if (e === "permission_denied" || e.startsWith("permission_denied")) {
    return "permission_denied";
  }
  if (MISSING_ARG_PATTERNS.some((p) => p.errorRe.test(e))) {
    return "missing_required_args";
  }
  if (/^missing\s+/i.test(e)) return "missing_required_args";
  return "other";
}

export function missingRequiredFieldsForTool(
  toolName: string,
  error: string | undefined
): string[] {
  const e = error ?? "";
  const row = MISSING_ARG_PATTERNS.find(
    (p) => p.tool === toolName && p.errorRe.test(e)
  );
  if (row) return [...row.fields];
  const m = e.match(/^missing\s+(.+)$/i);
  if (!m) return [];
  return m[1]!
    .split(/\s+or\s+|\s+and\s+|,\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type MissingArgRepairContext = {
  userContent: string;
  toolName: string;
  error: string;
  requiredFields: string[];
  existingArgs: Record<string, unknown>;
  focusProjectId?: string;
};

function nonEmptyStr(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/**
 * Populate missing fields from trusted turn context only (no privileged guessing).
 */
export function buildTrustedRepairArgs(
  ctx: MissingArgRepairContext
): Record<string, unknown> | null {
  const out: Record<string, unknown> = { ...ctx.existingArgs };
  const need = new Set(ctx.requiredFields);
  const user = ctx.userContent.trim();

  if (ctx.toolName === "avatars.workshop.open_draft") {
    if (need.has("wikiQuery") && !nonEmptyStr(out.wikiQuery)) {
      const q = extractAvatarCreationQuery(user);
      if (q.length >= 2) out.wikiQuery = q;
    }
    if (need.has("seedText") && !nonEmptyStr(out.seedText)) {
      if (user.length >= 8) out.seedText = user.slice(0, 2000);
    }
  }

  if (ctx.toolName === "drafts.tasks") {
    if (need.has("projectId") && !nonEmptyStr(out.projectId) && ctx.focusProjectId) {
      out.projectId = ctx.focusProjectId;
    }
    if (need.has("title") && !nonEmptyStr(out.title)) {
      const m = user.match(
        /\b(?:task|todo|add)\s*[:\-]?\s*(.+?)(?:[.?!]|$)/i
      );
      const title = m?.[1]?.trim();
      if (title && title.length >= 2) out.title = title.slice(0, 400);
    }
  }

  if (ctx.toolName === "drafts.calendar_event") {
    if (need.has("title") && !nonEmptyStr(out.title)) {
      const m = user.match(
        /\b(?:meeting|event|calendar)\s*[:\-]?\s*(.+?)(?:[.?!]|$)/i
      );
      const title = m?.[1]?.trim();
      if (title && title.length >= 2) out.title = title.slice(0, 400);
    }
    if (need.has("startAt") && out.startAt === undefined) {
      const m = user.match(/\b(at|on)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)/i);
      if (m) {
        const parsed = Date.parse(m[0]);
        if (!Number.isNaN(parsed)) out.startAt = parsed;
      }
    }
  }

  if (ctx.toolName === "drafts.email_reply") {
    if (need.has("body") && !nonEmptyStr(out.body) && user.length >= 12) {
      out.body = user.slice(0, 8000);
    }
  }

  for (const field of ctx.requiredFields) {
    const v = out[field];
    if (v === undefined || v === null) return null;
    if (typeof v === "string" && !v.trim()) return null;
    if (Array.isArray(v) && v.length === 0) return null;
  }
  return out;
}

export type MissingArgRepairAttemptResult = {
  repairedTool: WorldviewToolCall;
  lineage: MissingArgRepairLineage;
};

/**
 * At most one repair per turn: first eligible failed tool only.
 */
export function attemptMissingArgRepairForResults(
  tools: WorldviewToolCall[],
  results: WorldviewToolExecutionResult[],
  ctx: {
    userContent: string;
    focusProjectId?: string;
  }
): MissingArgRepairAttemptResult | null {
  for (let i = 0; i < tools.length && i < results.length; i++) {
    const t = tools[i]!;
    const r = results[i]!;
    if (r.ok) continue;
    if (classifyToolError(r.error) !== "missing_required_args") continue;
    const requiredFields = missingRequiredFieldsForTool(t.name, r.error);
    if (requiredFields.length === 0) continue;
    const args = buildTrustedRepairArgs({
      userContent: ctx.userContent,
      toolName: t.name,
      error: r.error ?? "missing",
      requiredFields,
      existingArgs: t.args as Record<string, unknown>,
      focusProjectId: ctx.focusProjectId,
    });
    if (!args) continue;
    return {
      repairedTool: { name: t.name, args },
      lineage: "repair_missing_args",
    };
  }
  return null;
}
