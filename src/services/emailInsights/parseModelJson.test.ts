import { describe, it, expect } from "vitest";
import { parseJsonObjectFromModelText } from "./parseModelJson";

describe("parseJsonObjectFromModelText", () => {
  it("parses fenced json", () => {
    const o = parseJsonObjectFromModelText(
      'Here\n```json\n{"summary":"hi","relevance":"relevant"}\n```\n'
    );
    expect(o?.summary).toBe("hi");
    expect(o?.relevance).toBe("relevant");
  });

  it("parses trailing json after prose", () => {
    const o = parseJsonObjectFromModelText(
      'Sure.\n{"summary":"x","relevance":"uncertain"}'
    );
    expect(o?.summary).toBe("x");
  });
});
