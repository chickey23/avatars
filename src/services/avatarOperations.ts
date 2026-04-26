import type { Avatar } from "../types";
import { AGENTIC_TOOL_IDS, TOOL_GROUPS, toolGroupFor } from "./agenticTools";
import {
  findAvatarsWithTag,
  MONITOR_PREFIX,
  monitorTag,
  TOOL_OWNER_PREFIX,
  toolOwnerTag,
} from "./avatarTags";
import { listRegisteredMonitors, type MonitorDef } from "./monitors";

export type AvatarStewardship = {
  name: string;
  tag: string;
  label: string;
  required?: boolean;
  description?: string;
};

export type AvatarCapability = {
  id: string;
  label: string;
  kind: "tool_group" | "tool" | "default_tools" | "no_tools";
  description?: string;
};

export type StewardshipWorkshopRow = {
  name: string;
  tag: string;
  label: string;
  required: boolean;
  description?: string;
  claimants: Avatar[];
  status: "claimed" | "unclaimed" | "duplicate";
};

export type CapabilityGroupRow = {
  group: string;
  tag: string;
  label: string;
  toolIds: string[];
  claimants: Avatar[];
  status: "claimed" | "unclaimed" | "duplicate";
};

export const DEFAULT_TOOLS_CAPABILITY_ID = "default_general_tools" as const;
export const NO_TOOLS_CAPABILITY_ID = "no_json_tools" as const;

const STEWARDSHIP_LABELS: Record<string, string> = {
  "source_runner:email": "Email source runner",
  "source_runner:calendar": "Calendar source runner",
  "source_runner:contacts": "Contacts source runner",
  due_and_snoozed_items: "Due and snoozed item scheduler",
  unassigned_projects: "Unassigned project steward",
  unclaimed_contracts: "Unclaimed stewardship warnings",
  worldview_gaps: "Worldview gap scanner",
  source_cache_staleness: "Source cache staleness watcher",
  gmail_auth_drift: "Gmail auth drift watcher",
  overdue_drafts: "Overdue draft watcher",
};

const TOOL_GROUP_LABELS: Record<string, string> = {
  drafts: "Draft write tools",
  avatar_creation: "Avatar creation workshop",
};

const TOOL_LABELS: Record<string, string> = {
  "world_metadata.patch_projects": "Patch project metadata",
  "world_metadata.patch_people": "Patch people metadata",
  "user_profile.patch": "Patch user profile",
  "gmail.fetch_message_body": "Fetch Gmail message body",
  "drafts.tasks": "Create task drafts",
  "drafts.calendar_event": "Create calendar drafts",
  "drafts.email_reply": "Create email reply drafts",
  "avatars.workshop.open_draft": "Open avatar creation draft",
};

function humanizeIdentifier(id: string): string {
  return id
    .replace(/[:._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export function stewardshipLabel(name: string): string {
  return STEWARDSHIP_LABELS[name] ?? humanizeIdentifier(name);
}

export function capabilityGroupLabel(group: string): string {
  return TOOL_GROUP_LABELS[group] ?? humanizeIdentifier(group);
}

export function toolCapabilityLabel(toolId: string): string {
  return TOOL_LABELS[toolId] ?? humanizeIdentifier(toolId);
}

export function registeredNonGroupToolIds(): string[] {
  return AGENTIC_TOOL_IDS.filter((id) => !toolGroupFor(id));
}

export function getAvatarStewardships(
  avatar: Avatar,
  monitors: readonly MonitorDef[] = listRegisteredMonitors()
): AvatarStewardship[] {
  const byName = new Map(monitors.map((m) => [m.name, m]));
  return (avatar.systemTags ?? [])
    .filter((tag) => tag.startsWith(MONITOR_PREFIX))
    .map((tag) => {
      const name = tag.slice(MONITOR_PREFIX.length);
      const def = byName.get(name);
      return {
        name,
        tag,
        label: stewardshipLabel(name),
        required: def?.required,
        description: def?.description,
      };
    });
}

export function getAvatarCapabilities(avatar: Avatar): AvatarCapability[] {
  const out: AvatarCapability[] = [];
  for (const tag of avatar.systemTags ?? []) {
    if (!tag.startsWith(TOOL_OWNER_PREFIX)) continue;
    const group = tag.slice(TOOL_OWNER_PREFIX.length);
    out.push({
      id: group,
      label: capabilityGroupLabel(group),
      kind: "tool_group",
      description: `Owns ${capabilityGroupToolIds(group)
        .map(toolCapabilityLabel)
        .join(", ")}`,
    });
  }

  if (avatar.allowedAgenticToolIds === undefined) {
    out.push({
      id: DEFAULT_TOOLS_CAPABILITY_ID,
      label: "Default general tool access",
      kind: "default_tools",
      description:
        "May use registered non-group tools; grouped tools still require ownership.",
    });
    return out;
  }

  if (avatar.allowedAgenticToolIds.length === 0) {
    out.push({
      id: NO_TOOLS_CAPABILITY_ID,
      label: "No JSON agentic tools",
      kind: "no_tools",
      description: "Explicitly opted out of individual JSON tool access.",
    });
    return out;
  }

  for (const toolId of avatar.allowedAgenticToolIds) {
    out.push({
      id: toolId,
      label: toolCapabilityLabel(toolId),
      kind: "tool",
      description: toolGroupFor(toolId)
        ? `Also requires ${toolOwnerTag(toolGroupFor(toolId)!)} ownership.`
        : undefined,
    });
  }
  return out;
}

export function getAvatarOperationalRoles(avatar: Avatar): {
  stewardships: AvatarStewardship[];
  capabilities: AvatarCapability[];
} {
  return {
    stewardships: getAvatarStewardships(avatar),
    capabilities: getAvatarCapabilities(avatar),
  };
}

export function buildStewardshipWorkshopRows(
  catalog: readonly Avatar[],
  monitors: readonly MonitorDef[] = listRegisteredMonitors()
): StewardshipWorkshopRow[] {
  return monitors.map((def) => {
    const tag = monitorTag(def.name);
    const claimants = findAvatarsWithTag(catalog, tag);
    return {
      name: def.name,
      tag,
      label: stewardshipLabel(def.name),
      required: def.required,
      description: def.description,
      claimants,
      status:
        claimants.length === 0
          ? "unclaimed"
          : claimants.length > 1
            ? "duplicate"
            : "claimed",
    };
  });
}

export function capabilityGroupToolIds(group: string): string[] {
  return Array.from(TOOL_GROUPS[group] ?? []);
}

export function buildCapabilityGroupRows(
  catalog: readonly Avatar[]
): CapabilityGroupRow[] {
  return Object.keys(TOOL_GROUPS).map((group) => {
    const tag = toolOwnerTag(group);
    const claimants = findAvatarsWithTag(catalog, tag);
    return {
      group,
      tag,
      label: capabilityGroupLabel(group),
      toolIds: capabilityGroupToolIds(group),
      claimants,
      status:
        claimants.length === 0
          ? "unclaimed"
          : claimants.length > 1
            ? "duplicate"
            : "claimed",
    };
  });
}
