import { describe, it, expect } from "vitest";
import { getAvatarPortraitSrc } from "./avatarPortrait";

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
