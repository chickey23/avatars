import { describe, expect, it } from "vitest";
import { buildWorldMetadataScoringCorpus } from "./scoringCorpus";
import { createEmptyWorldMetadataDoc } from "./types";

describe("buildWorldMetadataScoringCorpus", () => {
  it("includes user profile and focused project snippets", () => {
    const doc = createEmptyWorldMetadataDoc();
    doc.userProfile.displayName = "Sam";
    doc.userProfile.notes = "Prefers morning meetings";
    doc.projects["p1"] = {
      title: "Trip",
      summary: "Summer travel planning",
      notes: "",
      updatedAt: 1,
    };
    const s = buildWorldMetadataScoringCorpus(doc, {
      project: { id: "p1", title: "Trip" },
    });
    expect(s).toContain("sam");
    expect(s).toContain("summer travel");
  });

  it("respects maxChars", () => {
    const doc = createEmptyWorldMetadataDoc();
    doc.userProfile.notes = "a".repeat(5000);
    const s = buildWorldMetadataScoringCorpus(doc, undefined, {
      maxChars: 100,
    });
    expect(s.length).toBeLessThanOrEqual(100);
  });
});
