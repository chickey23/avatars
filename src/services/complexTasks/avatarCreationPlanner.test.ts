import { describe, expect, it } from "vitest";
import {
  avatarCreationProjectId,
  avatarCreationTaskId,
  parseAvatarCreationPlan,
} from "./avatarCreationPlanner";

describe("parseAvatarCreationPlan", () => {
  it("splits a named avatar creation request", () => {
    const plan = parseAvatarCreationPlan(
      "Create avatars named Malcolm Reynolds, Zoe Washburne, and Inara Serra"
    );

    expect(plan?.kind).toBe("named_list");
    expect(plan?.subjects).toEqual([
      "Malcolm Reynolds",
      "Zoe Washburne",
      "Inara Serra",
    ]);
    expect(plan?.projectTitle).toContain("Malcolm Reynolds");
  });

  it("supports numeric count wording while trusting parsed names", () => {
    const plan = parseAvatarCreationPlan(
      "Please create three avatars named Athena, Hermes, and Artemis"
    );

    expect(plan?.subjects).toEqual(["Athena", "Hermes", "Artemis"]);
    expect(plan?.projectTitle).toBe("Create avatars: Athena, Hermes, Artemis");
  });

  it("creates a set discovery plan when names are not enumerated", () => {
    const plan = parseAvatarCreationPlan("Create avatars for the main crew of Firefly");

    expect(plan?.kind).toBe("set_discovery");
    expect(plan?.subjects).toEqual([]);
    expect(plan?.discoveryQuery).toContain("main crew of Firefly");
  });

  it("returns null for unrelated requests", () => {
    expect(parseAvatarCreationPlan("summarize this email")).toBeNull();
  });

  it("builds stable project and task ids", () => {
    const plan = parseAvatarCreationPlan("Create avatars named Alice and Bob")!;

    expect(avatarCreationProjectId(plan)).toMatch(/^complex_avatar_/);
    expect(avatarCreationTaskId(plan, "Alice")).toMatch(/_alice$/);
  });
});
