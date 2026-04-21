import { describe, expect, it } from "vitest";
import { suggestActiveTaskFromUserMessage } from "./activeTaskAgent";

describe("suggestActiveTaskFromUserMessage", () => {
  it("extracts phrasing from explicit patterns", () => {
    const s = suggestActiveTaskFromUserMessage(
      "I'm working on the quarterly report today."
    );
    expect(s?.toLowerCase()).toContain("quarterly");
  });

  it("returns undefined for vague short input", () => {
    expect(suggestActiveTaskFromUserMessage("hi")).toBeUndefined();
  });
});
