import { describe, it, expect } from "vitest";
import type { Avatar } from "../../types";
import {
  findAvatarsWithTag,
  hasSystemTag,
  monitorTag,
  preserveSystemTags,
  toolOwnerTag,
} from "./index";

const mk = (id: string, systemTags?: string[]): Avatar =>
  ({
    id,
    processName: id,
    givenName: id,
    appellation: id,
    description: "",
    tags: [],
    personality: "",
    interests: [],
    assignedTasks: [],
    opinions: {},
    systemTags,
  }) as Avatar;

describe("avatarTags", () => {
  it("hasSystemTag tolerates missing/empty systemTags", () => {
    expect(hasSystemTag(undefined, "system")).toBe(false);
    expect(hasSystemTag(mk("a"), "system")).toBe(false);
    expect(hasSystemTag(mk("a", []), "system")).toBe(false);
    expect(hasSystemTag(mk("a", ["system"]), "system")).toBe(true);
  });

  it("findAvatarsWithTag narrows to tag holders", () => {
    const cat = [
      mk("a", ["system"]),
      mk("b", ["monitor:foo"]),
      mk("c"),
      mk("d", ["system", "monitor:foo"]),
    ];
    expect(findAvatarsWithTag(cat, "system").map((x) => x.id)).toEqual(["a", "d"]);
    expect(findAvatarsWithTag(cat, "monitor:foo").map((x) => x.id)).toEqual(["b", "d"]);
    expect(findAvatarsWithTag(cat, "missing")).toEqual([]);
  });

  it("builders produce expected tag strings", () => {
    expect(toolOwnerTag("drafts")).toBe("tool_owner:drafts");
    expect(monitorTag("unassigned_projects")).toBe("monitor:unassigned_projects");
  });

  it("preserveSystemTags keeps previous tags over incoming", () => {
    const prev = mk("steward", ["system", "tool_owner:drafts"]);
    const incoming = mk("steward");
    const merged = preserveSystemTags(incoming, prev);
    expect(merged.systemTags).toEqual(["system", "tool_owner:drafts"]);
  });

  it("preserveSystemTags leaves incoming alone when previous has no tags", () => {
    const prev = mk("x");
    const incoming = mk("x");
    expect(preserveSystemTags(incoming, prev)).toBe(incoming);
  });
});
