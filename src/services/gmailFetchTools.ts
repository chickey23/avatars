/**
 * Allowlisted Gmail body fetch tools (async); separate from sync worldview patches.
 */

import type { Avatar } from "../types";
import { fetchGmailMessageBody } from "../connectors/gmail";
import { avatarMayUseAgenticTool } from "./agenticTools/registry";
import type { WorldviewToolCall } from "./worldviewTools/parse";

export const GMAIL_FETCH_MESSAGE_BODY_TOOL = "gmail.fetch_message_body" as const;

export type GmailFetchToolResult = {
  name: string;
  ok: boolean;
  error?: string;
  /** Gmail message id when relevant */
  detail?: string;
};

export function isGmailFetchMessageBodyTool(name: string): boolean {
  return name === GMAIL_FETCH_MESSAGE_BODY_TOOL;
}

export function partitionWorldviewTools(tools: WorldviewToolCall[]): {
  fetchTools: WorldviewToolCall[];
  patchTools: WorldviewToolCall[];
} {
  const fetchTools: WorldviewToolCall[] = [];
  const patchTools: WorldviewToolCall[] = [];
  for (const t of tools) {
    if (isGmailFetchMessageBodyTool(t.name)) fetchTools.push(t);
    else patchTools.push(t);
  }
  return { fetchTools, patchTools };
}

/**
 * Fetch bodies only for ids in `allowlist` (turn-scoped).
 */
export async function executeGmailFetchMessageBodyTools(
  tools: WorldviewToolCall[],
  allowlist: string[] | undefined,
  avatar?: Avatar
): Promise<{
  results: GmailFetchToolResult[];
  bodyBlocks: string[];
  anySuccess: boolean;
}> {
  const allow = new Set((allowlist ?? []).filter(Boolean));
  const results: GmailFetchToolResult[] = [];
  const bodyBlocks: string[] = [];
  let anySuccess = false;

  for (const t of tools) {
    if (avatar && !avatarMayUseAgenticTool(avatar, t.name)) {
      results.push({
        name: t.name,
        ok: false,
        error: "permission_denied",
      });
      continue;
    }
    const args = t.args as { messageId?: unknown };
    const messageId =
      typeof args.messageId === "string" ? args.messageId.trim() : "";
    if (!messageId) {
      results.push({
        name: t.name,
        ok: false,
        error: "missing messageId",
      });
      continue;
    }
    if (!allow.has(messageId)) {
      results.push({
        name: t.name,
        ok: false,
        error: "not allowlisted for this turn",
        detail: messageId,
      });
      continue;
    }
    const { body } = await fetchGmailMessageBody(messageId);
    if (!body?.trim()) {
      results.push({
        name: t.name,
        ok: false,
        error: "empty or fetch failed",
        detail: messageId,
      });
      continue;
    }
    anySuccess = true;
    results.push({
      name: t.name,
      ok: true,
      detail: messageId,
    });
    bodyBlocks.push(`Email body [${messageId}]:\n${body}`);
  }

  return { results, bodyBlocks, anySuccess };
}
