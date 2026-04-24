import { describe, it, expect } from "vitest";
import {
  avatarMayUseAgenticTool,
  filterToolsByAvatarPermissions,
} from "./registry";
import type { Avatar } from "../../types";
import type { WorldviewToolCall } from "../worldviewTools/parse";

const baseAvatar = (over: Partial<Avatar>): Avatar =>
  ({
    id: "a1",
    processName: "p",
    givenName: "G",
    appellation: "g",
    description: "d",
    tags: [],
    personality: "x",
    interests: [],
    opinions: {},
    ...over,
  }) as Avatar;

describe("registry permissions", () => {
  it("allows all tools when allowedAgenticToolIds omitted", () => {
    const a = baseAvatar({});
    expect(avatarMayUseAgenticTool(a, "user_profile.patch")).toBe(true);
  });

  it("denies non-group tools when allowedAgenticToolIds is an empty array", () => {
    const a = baseAvatar({ allowedAgenticToolIds: [] });
    expect(avatarMayUseAgenticTool(a, "user_profile.patch")).toBe(false);
    const owner = baseAvatar({
      systemTags: ["tool_owner:drafts"],
      allowedAgenticToolIds: [],
    });
    expect(avatarMayUseAgenticTool(owner, "drafts.tasks")).toBe(true);
    expect(avatarMayUseAgenticTool(owner, "user_profile.patch")).toBe(false);
  });

  it("denies when id not in allowlist", () => {
    const a = baseAvatar({ allowedAgenticToolIds: ["world_metadata.patch_projects"] });
    expect(avatarMayUseAgenticTool(a, "user_profile.patch")).toBe(false);
  });

  it("filterToolsByAvatarPermissions splits", () => {
    const a = baseAvatar({ allowedAgenticToolIds: ["user_profile.patch"] });
    const tools: WorldviewToolCall[] = [
      { name: "user_profile.patch", args: { patch: { notes: "n" } } },
      { name: "world_metadata.patch_projects", args: { patch: {} } },
    ];
    const { allowed, denied } = filterToolsByAvatarPermissions(a, tools);
    expect(allowed.length).toBe(1);
    expect(denied.length).toBe(1);
  });

  it("group-owned tools require tool_owner:<group> tag regardless of allowlist", () => {
    /** A plain avatar with the draft tools in their allowlist is still denied. */
    const plain = baseAvatar({
      allowedAgenticToolIds: ["drafts.tasks"],
    });
    expect(avatarMayUseAgenticTool(plain, "drafts.tasks")).toBe(false);

    /** An avatar tagged tool_owner:drafts may use them even without an allowlist. */
    const owner = baseAvatar({ systemTags: ["tool_owner:drafts"] });
    expect(avatarMayUseAgenticTool(owner, "drafts.tasks")).toBe(true);
    expect(avatarMayUseAgenticTool(owner, "drafts.calendar_event")).toBe(true);
    expect(avatarMayUseAgenticTool(owner, "drafts.email_reply")).toBe(true);

    /** Other tools remain unrestricted for that owner (no allowlist = all non-group tools). */
    expect(avatarMayUseAgenticTool(owner, "user_profile.patch")).toBe(true);
  });

  it("drafts.* ids pass the tool_owner:drafts gate", () => {
    const owner = baseAvatar({ systemTags: ["tool_owner:drafts"] });
    expect(avatarMayUseAgenticTool(owner, "drafts.tasks")).toBe(true);
    expect(avatarMayUseAgenticTool(owner, "drafts.calendar_event")).toBe(true);
    expect(avatarMayUseAgenticTool(owner, "drafts.email_reply")).toBe(true);
  });

  it("avatars.workshop.open_draft requires tool_owner:avatar_creation", () => {
    const plain = baseAvatar({
      allowedAgenticToolIds: ["avatars.workshop.open_draft"],
    });
    expect(avatarMayUseAgenticTool(plain, "avatars.workshop.open_draft")).toBe(
      false
    );
    const owner = baseAvatar({
      systemTags: ["system", "tool_owner:avatar_creation"],
    });
    expect(avatarMayUseAgenticTool(owner, "avatars.workshop.open_draft")).toBe(
      true
    );
  });
});
