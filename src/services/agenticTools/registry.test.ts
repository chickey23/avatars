import { describe, it, expect } from "vitest";
import { avatarMayUseAgenticTool, filterToolsByAvatarPermissions } from "./registry";
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
});
