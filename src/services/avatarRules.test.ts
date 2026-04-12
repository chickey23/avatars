import { describe, it, expect } from "vitest";
import type { Avatar } from "../types";
import { getRuleBodiesForAvatar } from "./avatarRules";

const base = {
  processName: "x",
  givenName: "X",
  appellation: "X",
  description: "d",
  tags: [],
  personality: "p",
  interests: [],
  assignedTasks: [],
  opinions: {},
  ruleSetId: "default-muse",
} satisfies Partial<Avatar>;

describe("getRuleBodiesForAvatar", () => {
  it("appends supplementalRules as Custom block", () => {
    const avatar = {
      ...base,
      id: "u1",
      supplementalRules: "Always mention the sea.",
    } as Avatar;
    const { text } = getRuleBodiesForAvatar(avatar);
    expect(text).toContain("[Custom]");
    expect(text).toContain("Always mention the sea.");
  });

  it("prefers ruleBlockIds over ruleSetId when both present", () => {
    const avatar = {
      ...base,
      id: "u2",
      ruleBlockIds: ["global-brief"],
      ruleSetId: "default-muse",
    } as Avatar;
    const { text, blockIds } = getRuleBodiesForAvatar(avatar);
    expect(blockIds).toEqual(["global-brief"]);
    expect(text).toContain("Brevity");
    expect(text).not.toContain("Muse voice");
  });

  it("uses ruleSetId when ruleBlockIds absent", () => {
    const avatar = {
      ...base,
      id: "u3",
      ruleSetId: "default-skeptic",
    } as Avatar;
    const { text } = getRuleBodiesForAvatar(avatar);
    expect(text).toContain("Skeptic voice");
    expect(text).toContain("Stay in character");
  });
});
