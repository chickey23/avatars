import { describe, expect, it } from "vitest";
import { defaultAvatars } from "../data/defaultAvatars";
import { worldviewToolInstructionsForAvatar } from "./avatarAgents";

describe("worldviewToolInstructionsForAvatar", () => {
  it("Blessed Exchequer JSON example is workshop-only (no patch_projects tool line)", () => {
    const exc = defaultAvatars.find((a) => a.id === "blessed_exchequer");
    expect(exc).toBeDefined();
    const s = worldviewToolInstructionsForAvatar(exc!);
    expect(s).toMatch(/"name":"avatars\.workshop\.open_draft"/);
    expect(s).not.toMatch(/"name":"world_metadata\.patch_projects"/);
    expect(s).toContain("Avatar vs project");
    expect(s).toContain(
      "- avatars.workshop.open_draft (args: optional seedText and/or wikiQuery"
    );
    expect(s).not.toMatch(
      /^- world_metadata\.patch_projects/m
    );
  });

  it("returns full default block when no allowlist", () => {
    const muse = defaultAvatars.find((a) => a.id === "muse");
    expect(muse).toBeDefined();
    const s = worldviewToolInstructionsForAvatar(muse!);
    expect(s).toContain("world_metadata.patch_projects");
  });
});
