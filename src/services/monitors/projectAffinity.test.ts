import { describe, it, expect } from "vitest";
import type { Avatar } from "../../types";
import { scoreAvatarForProject, topAvatarsForProject } from "./projectAffinity";

const mk = (
  id: string,
  tags: string[],
  interests: string[],
  appellation = "",
  description = ""
): Avatar =>
  ({
    id,
    processName: id,
    givenName: id,
    appellation,
    description,
    tags,
    personality: "",
    interests,
    assignedTasks: [],
    opinions: {},
  }) as Avatar;

describe("projectAffinity", () => {
  it("scores 0 when no overlap", () => {
    const a = mk("x", ["painting"], ["oil"]);
    expect(
      scoreAvatarForProject(a, { title: "Rocket fuel chemistry" })
    ).toBe(0);
  });

  it("scores higher when tags overlap project tokens", () => {
    const muse = mk("muse", ["creative", "poetry"], ["imagination", "story"]);
    const accomplice = mk("accomplice", ["action", "strategy"], ["tactics"]);
    const projA = { title: "Poetry of imagination" };
    const projB = { title: "Tactical strategy review" };
    expect(
      scoreAvatarForProject(muse, projA)
    ).toBeGreaterThan(scoreAvatarForProject(accomplice, projA));
    expect(
      scoreAvatarForProject(accomplice, projB)
    ).toBeGreaterThan(scoreAvatarForProject(muse, projB));
  });

  it("topAvatarsForProject returns up to k sorted desc", () => {
    const a = mk("a", ["alpha"], []);
    const b = mk("b", ["alpha", "beta"], []);
    const c = mk("c", ["gamma"], []);
    const top = topAvatarsForProject([a, b, c], { title: "alpha beta" }, 2);
    expect(top).toHaveLength(2);
    expect(top[0]?.avatarId).toBe("b");
    expect(top[0]!.score).toBeGreaterThanOrEqual(top[1]!.score);
  });

  it("ignores stopwords and punctuation", () => {
    const a = mk("a", ["planning"], []);
    const score = scoreAvatarForProject(a, {
      title: "THE planning, of a review!",
    });
    expect(score).toBeGreaterThan(0);
  });
});
