import { describe, expect, it } from "vitest";
import {
  avatarCreationProjectId,
  avatarCreationTaskId,
  buildDiscoverySuffixPool,
  buildSetDiscoverySearchQueries,
  discoveryQueriesForPlan,
  discoverySearchBases,
  normalizeAvatarCreationSubjectNames,
  parseAvatarCreationPlan,
  stripDiscoveryBoilerplate,
  type AvatarCreationPlan,
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
    expect(plan?.discoveryQuery).toBe("Firefly");
    expect(plan?.discoverySearchQueries?.[0]).toBe("Firefly");
    expect(plan?.discoverySearchQueries?.length).toBeGreaterThanOrEqual(3);
  });

  it("returns null for unrelated requests", () => {
    expect(parseAvatarCreationPlan("summarize this email")).toBeNull();
  });

  it("builds stable project and task ids", () => {
    const plan = parseAvatarCreationPlan("Create avatars named Alice and Bob")!;

    expect(avatarCreationProjectId(plan)).toMatch(/^complex_avatar_/);
    expect(avatarCreationTaskId(plan, "Alice")).toMatch(/_alice$/);
  });

  // Parser currently requires "create … avatars" / "avatar" after optional count;
  // "create an avatar" inserts "an" and does not match. Revisit with parser breadth.
  it("returns null for singular create an avatar named … (known phrasing gap)", () => {
    expect(parseAvatarCreationPlan("create an avatar named Alice")).toBeNull();
  });

  it("accepts synonym verbs make / build / add", () => {
    expect(
      parseAvatarCreationPlan("make 3 avatars named Athena, Hermes, and Artemis")
        ?.subjects
    ).toEqual(["Athena", "Hermes", "Artemis"]);

    expect(
      parseAvatarCreationPlan("build avatars called Alice and Bob")?.subjects
    ).toEqual(["Alice", "Bob"]);

    expect(parseAvatarCreationPlan("add avatars named Alice")?.subjects).toEqual([
      "Alice",
    ]);
  });

  it("treats comma-only for … segment as named_list", () => {
    const plan = parseAvatarCreationPlan(
      "Create avatars for Alice, Bob, and Carol"
    );

    expect(plan?.kind).toBe("named_list");
    expect(plan?.subjects).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("strips trailing politeness from subject names", () => {
    const plan = parseAvatarCreationPlan(
      "create avatars named Alice and Bob, please"
    );

    expect(plan?.subjects).toEqual(["Alice", "Bob"]);
  });

  it("uses set_discovery for cast-style requests without commas", () => {
    const plan = parseAvatarCreationPlan(
      "Create avatars for the cast of Stranger Things"
    );

    expect(plan?.kind).toBe("set_discovery");
    expect(plan?.discoveryQuery).toBe("Stranger Things");
    expect(plan?.discoverySearchQueries?.[0]).toBe("Stranger Things");
  });

  it("strips members-of phrasing for legion-style set descriptions", () => {
    expect(stripDiscoveryBoilerplate("members of the legion of doom")).toBe(
      "legion of doom"
    );
    const qs = buildSetDiscoverySearchQueries("members of the legion of doom");
    expect(qs[0]).toBe("legion of doom");
    expect(qs.some((q) => q.includes("well-known") || q.includes("popular"))).toBe(
      true
    );
  });

  it("strips each member of and expands team from show", () => {
    expect(stripDiscoveryBoilerplate("each member of team rocket")).toBe("team rocket");
    const bases = discoverySearchBases("each member of team rocket");
    expect(bases).toContain("team rocket");
  });

  it("splits Order of … from … into multiple discovery bases", () => {
    const bases = discoverySearchBases(
      "the Order of the Triad from Venture Brothers"
    );
    expect(bases).toContain("Order of the Triad");
    expect(bases).toContain("Venture Brothers");
    expect(bases.some((b) => b.includes("Venture Brothers"))).toBe(true);
  });

  it("adds The X and X bases for franchise X Family pattern", () => {
    const bases = discoverySearchBases("Simpsons Family");
    expect(bases[0]).toBe("Simpsons Family");
    expect(bases).toContain("The Simpsons");
    expect(bases).toContain("Simpsons");
    const qs = buildSetDiscoverySearchQueries("Simpsons Family");
    expect(qs[0]).toBe("Simpsons Family");
    expect(qs).toContain("The Simpsons");
  });

  it("adds æsir bases for common Aenir/Aesir misspellings", () => {
    const bases = discoverySearchBases("Aenir");
    expect(bases).toContain("Aenir");
    expect(bases).toContain("æsir");
    expect(bases).toContain("aesir mythology");
  });

  it("normalizes scrambled each spelling for discovery strip", () => {
    expect(stripDiscoveryBoilerplate("eACh member of team rocket")).toBe("team rocket");
  });

  it("prioritizes mythology-related suffixes when seed hints myth", () => {
    const pool = buildDiscoverySuffixPool("members of the æsir pantheon");
    expect(pool.indexOf("mythology")).toBeLessThan(pool.indexOf("popular"));
  });

  it("rebuilds discovery query list from projectTitle when action payload omits searchQueries", () => {
    const plan = {
      kind: "set_discovery" as const,
      projectTitle: "Create avatars for each member of team rocket",
      originalRequest: "Create avatars for each member of team rocket",
      subjects: [],
      discoveryQuery: "team rocket",
      planId: "stale1",
    } satisfies AvatarCreationPlan;
    const qs = discoveryQueriesForPlan(plan);
    expect(qs[0]).toBe("team rocket");
    expect(qs.some((q) => q.includes("legendary") || q.includes("classic"))).toBe(
      true
    );
  });

  it("keeps planId stable across extra whitespace (same casing as originalRequest)", () => {
    const a = parseAvatarCreationPlan("Create avatars named Alice and Bob")!;
    const b = parseAvatarCreationPlan(
      "  Create   avatars   named   Alice and Bob  "
    )!;

    expect(a.planId).toBe(b.planId);
  });

  it("returns null for tell me about avatars", () => {
    expect(parseAvatarCreationPlan("tell me about avatars")).toBeNull();
  });

  it("returns null for create a project for Alice (not avatar creation)", () => {
    expect(parseAvatarCreationPlan("create a project for Alice")).toBeNull();
  });

  // Known limitation; revisit in Phase D Gap A (parser breadth).
  it("returns null for I'd like avatars for … (no create/make/build/add verb)", () => {
    expect(parseAvatarCreationPlan("I'd like avatars for Alice and Bob")).toBeNull();
  });

  // Known limitation; revisit in Phase D Gap A.
  it("returns null for set up avatars for …", () => {
    expect(parseAvatarCreationPlan("set up avatars for Alice and Bob")).toBeNull();
  });

  // Known limitation; revisit in Phase D Gap A.
  it("returns null for colon list without named/called/for segment", () => {
    expect(parseAvatarCreationPlan("create avatars: Alice, Bob, Carol")).toBeNull();
  });

  // known split bug: "and" becomes comma before split; Salt and Pepper become two subjects.
  it("splits Salt and Pepper as two subjects when comma follows (known split behavior)", () => {
    const plan = parseAvatarCreationPlan(
      "create avatars named Salt and Pepper, Sage"
    );

    expect(plan?.kind).toBe("named_list");
    expect(plan?.subjects).toEqual(["Salt", "Pepper", "Sage"]);
  });
});

describe("normalizeAvatarCreationSubjectNames", () => {
  it("merges discovery rows and splits comma lists like named-list parsing", () => {
    expect(
      normalizeAvatarCreationSubjectNames(["  Alice  ", "Bob, Carol"])
    ).toEqual(["Alice", "Bob", "Carol"]);
  });

  it("applies the same and-to-comma splitting as splitSubjects", () => {
    expect(
      normalizeAvatarCreationSubjectNames(["Alice", "Bob and Carol"])
    ).toEqual(["Alice", "Bob", "Carol"]);
  });
});
