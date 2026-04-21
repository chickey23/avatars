import { describe, it, expect } from "vitest";
import { getAvatarVizColor } from "./avatarVizColor";
import type { Avatar } from "../types";

describe("getAvatarVizColor", () => {
  it("uses built-in chat block colors for primary ids", () => {
    expect(getAvatarVizColor("muse", () => undefined)).toBe(
      "rgba(255, 255, 255, 0.9)"
    );
    expect(getAvatarVizColor("accomplice", () => undefined)).toBe("#e94560");
    expect(getAvatarVizColor("skeptic", () => undefined)).toBe("#111111");
  });

  it("prefers built-in map over catalog accent for known ids", () => {
    const purpleMuse = {
      id: "muse",
      appearance: { accentColor: "#c084fc" },
    } as Avatar;
    expect(getAvatarVizColor("muse", () => purpleMuse)).toBe(
      "rgba(255, 255, 255, 0.9)"
    );
  });

  it("falls back to catalog accent then default", () => {
    const custom = {
      id: "custom-1",
      appearance: { accentColor: "#00ff88" },
    } as Avatar;
    expect(getAvatarVizColor("custom-1", (id) => (id === "custom-1" ? custom : undefined))).toBe(
      "#00ff88"
    );
    expect(getAvatarVizColor("unknown", () => undefined)).toBe(
      "rgba(120, 120, 140, 0.65)"
    );
  });
});
