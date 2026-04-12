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
  });
});
