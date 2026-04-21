import { describe, expect, it } from "vitest";
import { projectMetadataDetailLines } from "./relevance";

describe("projectMetadataDetailLines", () => {
  it("returns empty when no project focus", () => {
    expect(projectMetadataDetailLines(undefined, {})).toEqual([]);
    expect(projectMetadataDetailLines({}, {})).toEqual([]);
  });

  it("includes title, summary, and notes", () => {
    const lines = projectMetadataDetailLines(
      { project: { id: "p1", title: "Alpha" } },
      {
        p1: {
          title: "Alpha",
          summary: "Ship MVP",
          notes: "Details here",
          updatedAt: 1,
        },
      }
    );
    expect(lines[0]).toContain("Alpha");
    expect(lines.some((l) => l.includes("summary:"))).toBe(true);
    expect(lines.some((l) => l.includes("notes:"))).toBe(true);
  });
});
