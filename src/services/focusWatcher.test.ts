import { describe, expect, it } from "vitest";
import { describeFocusChange } from "./focusWatcher";

describe("describeFocusChange", () => {
  it("returns null when focus is unchanged", () => {
    const f = { project: { id: "p", title: "X" } };
    expect(describeFocusChange(f, f)).toBeNull();
  });

  it("notes when focus is cleared", () => {
    expect(describeFocusChange({ email: { id: "e", title: "E" } }, {})).toBe(
      "Focus cleared."
    );
  });
});
