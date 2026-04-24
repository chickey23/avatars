import { describe, expect, it } from "vitest";
import {
  USER_CHROME_BY_SKIN_STORAGE_KEY,
  USER_CHROME_DEFAULT,
  USER_CHROME_STORAGE_KEY,
  readUserChromeColorBySkin,
  resolveUserChromeColorForSkin,
  serializeUserChromeColorBySkin,
} from "./appChromeConstants";

function storageFrom(entries: Record<string, string | null>) {
  return {
    getItem: (key: string) => entries[key] ?? null,
  };
}

describe("user chrome color persistence", () => {
  it("reads keyed colors and ignores malformed entries", () => {
    const colors = readUserChromeColorBySkin(
      storageFrom({
        [USER_CHROME_BY_SKIN_STORAGE_KEY]: JSON.stringify({
          default: "#112233",
          paper: "#abcdef",
          aurora: "not-a-color",
        }),
      })
    );

    expect(colors.default).toBe("#112233");
    expect(colors.paper).toBe("#abcdef");
    expect(colors.aurora).toBeUndefined();
  });

  it("migrates the legacy global color into the default skin fallback", () => {
    const colors = readUserChromeColorBySkin(
      storageFrom({
        [USER_CHROME_STORAGE_KEY]: "#445566",
      })
    );

    expect(colors.default).toBe("#445566");
    expect(resolveUserChromeColorForSkin(colors, "midnight")).toBe("#445566");
  });

  it("resolves specific skin colors before default and falls back safely", () => {
    expect(
      resolveUserChromeColorForSkin(
        { default: "#111111", midnight: "#222222" },
        "midnight"
      )
    ).toBe("#222222");
    expect(resolveUserChromeColorForSkin({}, "compact")).toBe(
      USER_CHROME_DEFAULT
    );
  });

  it("serializes only valid hex colors", () => {
    expect(
      JSON.parse(
        serializeUserChromeColorBySkin({
          default: "#123456",
          paper: "bad",
        })
      )
    ).toEqual({ default: "#123456" });
  });
});
