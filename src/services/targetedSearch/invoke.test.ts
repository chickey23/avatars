import { describe, expect, it } from "vitest";
import { shouldShowGoogleSearchBanner } from "./invoke";

describe("shouldShowGoogleSearchBanner", () => {
  it("returns false for empty", () => {
    expect(shouldShowGoogleSearchBanner([])).toBe(false);
  });
  it("detects cap notice", () => {
    expect(shouldShowGoogleSearchBanner(["google_daily_cap_reached"])).toBe(true);
  });
  it("detects not configured", () => {
    expect(shouldShowGoogleSearchBanner(["google_not_configured"])).toBe(true);
  });
  it("ignores add_or_rotate alone", () => {
    expect(shouldShowGoogleSearchBanner(["add_or_rotate_provider"])).toBe(false);
  });
});
