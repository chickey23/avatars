import { describe, it, expect, beforeEach } from "vitest";
import {
  __resetWorldMetadataForTests,
  getWorldMetadata,
  patchWorldMetadataProjects,
  pruneWorldMetadataPlaceholderProjects,
  seedProjectsIntoWorldMetadata,
} from "./store";

describe("seedProjectsIntoWorldMetadata", () => {
  beforeEach(() => {
    __resetWorldMetadataForTests();
  });

  it("inserts all titles when the store is empty", () => {
    const inserted = seedProjectsIntoWorldMetadata([
      "Antigravity",
      "Time Travel",
    ]);
    expect(inserted).toHaveLength(2);
    const projects = getWorldMetadata().projects;
    expect(Object.values(projects).map((p) => p.title).sort()).toEqual([
      "Antigravity",
      "Time Travel",
    ]);
  });

  it("is idempotent across repeated calls", () => {
    const first = seedProjectsIntoWorldMetadata(["Dungeontown"]);
    const second = seedProjectsIntoWorldMetadata(["Dungeontown"]);
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
    expect(Object.keys(getWorldMetadata().projects)).toHaveLength(1);
  });

  it("matches by case-insensitive normalized title, preserving the existing row", () => {
    patchWorldMetadataProjects({
      existing_id: { title: "Dungeontown" },
    });
    const inserted = seedProjectsIntoWorldMetadata(["dungeontown", "  DUNGEONTOWN  "]);
    expect(inserted).toHaveLength(0);
    const projects = getWorldMetadata().projects;
    expect(Object.keys(projects)).toEqual(["existing_id"]);
    expect(projects.existing_id!.title).toBe("Dungeontown");
  });

  it("skips placeholder titles entirely", () => {
    const inserted = seedProjectsIntoWorldMetadata([
      "Real Project",
      "…",
      "...",
      "<title>",
      "TBD",
    ]);
    expect(inserted).toHaveLength(1);
    expect(Object.values(getWorldMetadata().projects)[0]!.title).toBe(
      "Real Project"
    );
  });

  it("produces deterministic ids with numeric suffixes on collision", () => {
    /**
     * First seeding claims `seed_collab`. A second title with a different
     * case/punctuation happens to slugify to the same base; the collision
     * path should append `_2`.
     */
    const a = seedProjectsIntoWorldMetadata(["Collab"])[0]!;
    expect(a).toBe("seed_collab");
    /** Insert a second distinct title that slugifies to the same base. */
    const b = seedProjectsIntoWorldMetadata(["COLLAB!"])[0];
    expect(b).toBe("seed_collab_2");
  });
});

describe("pruneWorldMetadataPlaceholderProjects", () => {
  beforeEach(() => {
    __resetWorldMetadataForTests();
  });

  it("drops placeholder-title rows and leaves real ones", () => {
    patchWorldMetadataProjects({
      good: { title: "Antigravity" },
    });
    /**
     * Force a placeholder row through the merge guard by inserting directly
     * via the patch API with a real title first, then overwriting the title
     * field to a placeholder. Since the merge guard only blocks *new* rows,
     * this simulates a ghost row that predates the guard.
     */
    patchWorldMetadataProjects({ ghost: { title: "Antigravity" } });
    /** Corrupt the existing ghost row's title directly through the doc. */
    getWorldMetadata().projects.ghost!.title = "…";
    const dropped = pruneWorldMetadataPlaceholderProjects();
    expect(dropped).toEqual(["ghost"]);
    expect(Object.keys(getWorldMetadata().projects)).toEqual(["good"]);
  });

  it("is a no-op when there are no placeholders", () => {
    patchWorldMetadataProjects({ good: { title: "Antigravity" } });
    expect(pruneWorldMetadataPlaceholderProjects()).toEqual([]);
  });
});

describe("patchWorldMetadataProjects placeholder guard", () => {
  beforeEach(() => {
    __resetWorldMetadataForTests();
  });

  it("refuses to create a new row with a placeholder title", () => {
    patchWorldMetadataProjects({
      ghost: { title: "…" },
      real: { title: "Real Project" },
    });
    const ids = Object.keys(getWorldMetadata().projects);
    expect(ids).toEqual(["real"]);
  });
});
