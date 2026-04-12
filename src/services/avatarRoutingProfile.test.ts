import { describe, it, expect } from "vitest";
import { defaultAvatars } from "../data/defaultAvatars";
import {
  buildAvatarRoutingText,
  cosineSimilarity,
} from "./avatarRoutingProfile";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBe(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBe(0);
  });

  it("returns 0 for length mismatch", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
  });
});

describe("buildAvatarRoutingText", () => {
  it("includes name, description, tags, and tasks", () => {
    const map = new Map();
    map.set("muse", [
      {
        id: "t1",
        avatarId: "muse",
        title: "My task",
        status: "active" as const,
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const s = buildAvatarRoutingText(defaultAvatars[0], map);
    expect(s).toContain("Calliope");
    expect(s).toContain("Tags:");
    expect(s).toContain("Task: My task");
  });
});
