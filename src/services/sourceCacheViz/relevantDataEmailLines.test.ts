import { describe, it, expect } from "vitest";
import { parseRankedEmailLinesFromRelevantData } from "./relevantDataEmailLines";

describe("parseRankedEmailLinesFromRelevantData", () => {
  it("parses formatRankedEmailLine-shaped rows", () => {
    const lines = parseRankedEmailLinesFromRelevantData([
      'email [id abc123, rank 1, score 100]: Hello — hi (from x@y.com)',
      "focus: unrelated",
    ]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      emailId: "abc123",
      rank: 1,
      score: 100,
      rest: "Hello — hi (from x@y.com)",
    });
  });

  it("returns empty for undefined", () => {
    expect(parseRankedEmailLinesFromRelevantData(undefined)).toEqual([]);
  });
});
