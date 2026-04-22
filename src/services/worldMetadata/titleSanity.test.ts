import { describe, it, expect } from "vitest";
import { isPlaceholderProjectTitle } from "./titleSanity";

describe("isPlaceholderProjectTitle", () => {
  it("rejects empty, whitespace, and nullish input", () => {
    expect(isPlaceholderProjectTitle("")).toBe(true);
    expect(isPlaceholderProjectTitle("   ")).toBe(true);
    expect(isPlaceholderProjectTitle(null)).toBe(true);
    expect(isPlaceholderProjectTitle(undefined)).toBe(true);
  });

  it("rejects ellipsis glyphs, dots, and angle-bracket shells", () => {
    expect(isPlaceholderProjectTitle("…")).toBe(true);
    expect(isPlaceholderProjectTitle("...")).toBe(true);
    expect(isPlaceholderProjectTitle("......")).toBe(true);
    expect(isPlaceholderProjectTitle("  …  ")).toBe(true);
    expect(isPlaceholderProjectTitle("<...>")).toBe(true);
    expect(isPlaceholderProjectTitle("<title>")).toBe(true);
    expect(isPlaceholderProjectTitle("<project title>")).toBe(true);
  });

  it("rejects canonical placeholder words regardless of case", () => {
    expect(isPlaceholderProjectTitle("TBD")).toBe(true);
    expect(isPlaceholderProjectTitle("tbd")).toBe(true);
    expect(isPlaceholderProjectTitle("Untitled")).toBe(true);
    expect(isPlaceholderProjectTitle("Placeholder")).toBe(true);
    expect(isPlaceholderProjectTitle("Example")).toBe(true);
    expect(isPlaceholderProjectTitle("N/A")).toBe(true);
  });

  it("accepts real titles including ones that contain dots or ellipses", () => {
    expect(isPlaceholderProjectTitle("Antigravity")).toBe(false);
    expect(isPlaceholderProjectTitle("3D Print")).toBe(false);
    expect(isPlaceholderProjectTitle("Ancestry.com Source Tie-In")).toBe(false);
    expect(isPlaceholderProjectTitle("Lessons Learned…")).toBe(false);
    expect(isPlaceholderProjectTitle("The... Project")).toBe(false);
  });
});
