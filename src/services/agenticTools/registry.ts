import type { Avatar } from "../../types";
import type { WorldviewToolCall } from "../worldviewTools/parse";
import { hasSystemTag, toolOwnerTag } from "../avatarTags";

/**
 * Stable ids for permission checks (matches JSON `tools[].name`).
 */
export const AGENTIC_TOOL_IDS = [
  "world_metadata.patch_projects",
  "world_metadata.patch_people",
  "user_profile.patch",
  "gmail.fetch_message_body",
  "drafts.tasks",
  "drafts.calendar_event",
  "drafts.email_reply",
] as const;

export type AgenticToolId = (typeof AGENTIC_TOOL_IDS)[number];

/**
 * Tool groups for permission rules. Members of a group may only be invoked
 * by avatars tagged `tool_owner:<group>` (see `src/services/avatarTags/`).
 *
 * Groups:
 *   - `drafts` — three draft-write tools. Default holder: whichever avatar
 *     carries the tags; usually a `system`-tagged row. Re-tag to transfer
 *     ownership; unclaimed-contracts monitor warns if no avatar holds the tag.
 */
export const TOOL_GROUPS: Record<string, ReadonlySet<string>> = {
  drafts: new Set([
    "drafts.tasks",
    "drafts.calendar_event",
    "drafts.email_reply",
  ]),
};

/** All tool ids in the `drafts` group. */
export const DRAFTS_GROUP_TOOL_MEMBER_IDS: ReadonlySet<string> = TOOL_GROUPS.drafts;

export function isDraftsGroupTool(name: string): boolean {
  return TOOL_GROUPS.drafts.has(name);
}

export function toolGroupFor(name: string): string | undefined {
  for (const [group, members] of Object.entries(TOOL_GROUPS)) {
    if (members.has(name)) return group;
  }
  return undefined;
}

export function isRegisteredAgenticToolId(name: string): name is AgenticToolId {
  return (AGENTIC_TOOL_IDS as readonly string[]).includes(name);
}

/**
 * Permission rule:
 *   1. Group-owned tools: caller must carry `tool_owner:<group>` in
 *      `systemTags`, regardless of the per-avatar allowlist.
 *   2. Otherwise: if `allowedAgenticToolIds` is omitted/empty, all registered
 *      (non-group-owned) tools are allowed; else the tool must be in the list.
 */
export function avatarMayUseAgenticTool(avatar: Avatar, toolName: string): boolean {
  const group = toolGroupFor(toolName);
  if (group) {
    return hasSystemTag(avatar, toolOwnerTag(group));
  }
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
