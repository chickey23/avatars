import { describe, expect, it } from "vitest";
import {
  emptyBuilderSectionIds,
  scoreFieldEvidenceFromSections,
} from "./avatarCreationFieldEvidence";

describe("avatarCreationFieldEvidence", () => {
  it("marks sections with multiple lines as evidence", () => {
    const evidence = scoreFieldEvidenceFromSections([
      {
        id: "givenName",
        label: "Given name",
        lines: ["- Ada — https://example.com", "- Ada Lovelace — https://x.org"],
      },
      { id: "personality", label: "Personality", lines: [] },
    ]);
    expect(evidence.givenName?.confidence).toBe("evidence");
    expect(evidence.personality?.confidence).toBe("empty");
    expect(emptyBuilderSectionIds(evidence)).toContain("personality");
  });

  it("prefers prefill over search lines", () => {
    const evidence = scoreFieldEvidenceFromSections(
      [{ id: "givenName", label: "Given name", lines: [] }],
      { givenName: "Ada" }
    );
    expect(evidence.givenName?.confidence).toBe("evidence");
  });
});
