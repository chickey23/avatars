import { describe, it, expect } from "vitest";
import {
  getAvatarPortraitTransform,
  getAvatarPortraitObjectPosition,
  getAvatarPortraitSrc,
  normalizeAvatarPortraitPosition,
  normalizeAvatarPortraitScale,
} from "./avatarPortrait";

describe("getAvatarPortraitSrc", () => {
  it("prefers context override over appearance", () => {
    expect(
      getAvatarPortraitSrc({ a: "data:override" }, "a", "https://x/y.png")
    ).toBe("data:override");
  });

  it("falls back to appearance", () => {
    expect(getAvatarPortraitSrc(undefined, "a", "https://x/y.png")).toBe(
      "https://x/y.png"
    );
  });

  it("returns undefined when no source", () => {
    expect(getAvatarPortraitSrc(undefined, "a", undefined)).toBeUndefined();
  });
});

describe("avatar portrait positioning", () => {
  it("normalizes missing and out-of-range values", () => {
    expect(normalizeAvatarPortraitPosition(undefined)).toEqual({ x: 50, y: 50 });
    expect(normalizeAvatarPortraitPosition({ x: -12, y: 143 })).toEqual({
      x: 0,
      y: 100,
    });
  });

  it("formats CSS object-position percentages", () => {
    expect(getAvatarPortraitObjectPosition({ x: 23.4, y: 77.6 })).toBe(
      "23% 78%"
    );
  });

  it("normalizes scale to the magnification range", () => {
    expect(normalizeAvatarPortraitScale(undefined)).toBe(1);
    expect(normalizeAvatarPortraitScale(0.1)).toBe(0.5);
    expect(normalizeAvatarPortraitScale(2.7)).toBe(2);
    expect(normalizeAvatarPortraitScale(1.234)).toBe(1.23);
  });

  it("formats CSS scale transforms", () => {
    expect(getAvatarPortraitTransform(1.5)).toBe("scale(1.5)");
  });
});
