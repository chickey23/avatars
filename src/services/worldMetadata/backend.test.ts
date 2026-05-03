import { describe, expect, it } from "vitest";
import { migrateWorldMetadataDoc } from "./backend";

describe("migrateWorldMetadataDoc", () => {
  it("adds empty projects when legacy doc has only people", () => {
    const out = migrateWorldMetadataDoc({
      schemaVersion: 1,
      people: { c1: { updatedAt: 1, notes: "x" } },
    });
    expect(out.people).toEqual({ c1: { updatedAt: 1, notes: "x" } });
    expect(out.projects).toEqual({});
    expect(out.schemaVersion).toBe(4);
    expect(out.knowledgeSets).toEqual({});
    expect(out.userProfile.updatedAt).toBeDefined();
  });

  it("preserves projects when present", () => {
    const projects = {
      p1: { title: "Alpha", updatedAt: 2 },
    };
    const out = migrateWorldMetadataDoc({
      schemaVersion: 1,
      people: {},
      projects,
    });
    expect(out.projects).toEqual(projects);
    expect(out.userProfile).toBeDefined();
    expect(out.schemaVersion).toBe(4);
    expect(out.knowledgeSets).toEqual({});
  });

  it("migrates v2 with userProfile", () => {
    const out = migrateWorldMetadataDoc({
      schemaVersion: 2,
      people: {},
      projects: {},
      userProfile: {
        displayName: "Sam",
        updatedAt: 99,
      },
    });
    expect(out.userProfile.displayName).toBe("Sam");
    expect(out.userProfile.updatedAt).toBe(99);
    expect(out.knowledgeSets).toEqual({});
  });

  it("preserves curatedAssertions and pending profile patch from v4-shaped disk", () => {
    const out = migrateWorldMetadataDoc({
      schemaVersion: 3,
      people: {},
      projects: {},
      userProfile: { updatedAt: 1 },
      knowledgeSets: {},
      curatedAssertions: {
        ca_x: {
          id: "ca_x",
          object: "Moon",
          assertion: "Earth satellite",
          certainty: 0.9,
          source: "test",
          updatedAt: 2,
        },
      },
      pendingUserProfilePatch: {
        id: "p1",
        patch: { notes: "hello" },
        requestedByAvatarId: "muse",
        userMessageId: "u1",
        createdAt: 3,
      },
    });
    expect(out.curatedAssertions?.ca_x?.object).toBe("Moon");
    expect(out.pendingUserProfilePatch?.id).toBe("p1");
  });
});
