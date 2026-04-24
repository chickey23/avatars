import { describe, expect, it } from "vitest";
import { defaultAvatars } from "../../data/defaultAvatars";
import { resolveToolProfile, renderToolProtocol } from "./toolProtocol";

describe("toolProtocol", () => {
  it("Blessed Exchequer resolves to creation profile", () => {
    const exc = defaultAvatars.find((a) => a.id === "blessed_exchequer")!;
    expect(resolveToolProfile(exc, "none")).toBe("creation");
    expect(resolveToolProfile(exc, "creation")).toBe("creation");
    const s = renderToolProtocol("creation", exc);
    expect(s).toMatch(/avatars\.workshop\.open_draft/);
    expect(s).not.toMatch(/world_metadata\.patch_projects/);
  });

  it("inbox steward with empty allowlist is none profile", () => {
    const h = defaultAvatars.find((a) => a.id === "inbox_steward")!;
    expect(resolveToolProfile(h, "none")).toBe("none");
  });
});
