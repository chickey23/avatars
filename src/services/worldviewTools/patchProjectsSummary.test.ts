import { describe, expect, it } from "vitest";
import { summarizePatchProjectsForActivity } from "./patchProjectsSummary";

describe("summarizePatchProjectsForActivity", () => {
  it("includes quoted titles and ids", () => {
    const s = summarizePatchProjectsForActivity({
      proj_a: { title: "Kitchen remodel", notes: "" },
      proj_b: { title: "Yard work" },
    });
    expect(s).toContain("2 project(s):");
    expect(s).toContain('"Kitchen remodel"');
    expect(s).toContain("proj_a");
    expect(s).toContain('"Yard work"');
  });

  it("falls back to id when title missing", () => {
    const s = summarizePatchProjectsForActivity({
      only_id: { summary: "x" },
    });
    expect(s).toContain("only_id");
  });

  it("uses compact form when over length budget", () => {
    const longTitle = "A".repeat(200);
    const s = summarizePatchProjectsForActivity({
      p1: { title: longTitle },
      p2: { title: "B" },
    });
    expect(s.length).toBeLessThanOrEqual(180);
    expect(s).toContain("+1 more");
  });
});
