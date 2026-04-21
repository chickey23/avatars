import { describe, expect, it } from "vitest";
import {
  userProfileToRelevanceLines,
  USER_PROFILE_RELEVANCE_PREFIX,
} from "./userProfileRelevance";

describe("userProfileToRelevanceLines", () => {
  it("returns empty when nothing set", () => {
    expect(userProfileToRelevanceLines({ updatedAt: 1 })).toEqual([]);
  });

  it("emits one prefixed line with fields", () => {
    const lines = userProfileToRelevanceLines({
      updatedAt: 1,
      displayName: "Alex",
      pronouns: "they/them",
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].startsWith(USER_PROFILE_RELEVANCE_PREFIX)).toBe(true);
    expect(lines[0]).toContain("Alex");
    expect(lines[0]).toContain("they/them");
  });
});
