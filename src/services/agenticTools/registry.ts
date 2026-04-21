import type { Avatar } from "../../types";
import type { WorldviewToolCall } from "../worldviewTools/parse";

/** Stable ids for permission checks (matches JSON `tools[].name`). */
export const AGENTIC_TOOL_IDS = [
  "world_metadata.patch_projects",
  "world_metadata.patch_people",
  "user_profile.patch",
  "gmail.fetch_message_body",
] as const;

export type AgenticToolId = (typeof AGENTIC_TOOL_IDS)[number];

export function isRegisteredAgenticToolId(name: string): name is AgenticToolId {
  return (AGENTIC_TOOL_IDS as readonly string[]).includes(name);
}

/**
 * When `allowedAgenticToolIds` is omitted or empty, all registered tools are allowed.
 */
export function avatarMayUseAgenticTool(avatar: Avatar, toolName: string): boolean {
  const allowed = avatar.allowedAgenticToolIds;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(toolName);
}

export function filterToolsByAvatarPermissions(
  avatar: Avatar,
  tools: WorldviewToolCall[]
): { allowed: WorldviewToolCall[]; denied: WorldviewToolCall[] } {
  const allowed: WorldviewToolCall[] = [];
  const denied: WorldviewToolCall[] = [];
  for (const t of tools) {
    if (avatarMayUseAgenticTool(avatar, t.name)) allowed.push(t);
    else denied.push(t);
  }
  return { allowed, denied };
}
