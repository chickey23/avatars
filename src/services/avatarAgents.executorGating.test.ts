import { describe, it, expect } from "vitest";
import { defaultAvatars } from "../data/defaultAvatars";
import { resolveToolProfile } from "./agenticTools/toolProtocol";
import { detectTurnToolIntent } from "./turnToolIntent";
import { effectiveProjectExecutorForPrompt } from "./avatarAgents";

describe("effectiveProjectExecutorForPrompt", () => {
  const exc = defaultAvatars.find((a) => a.id === "blessed_exchequer")!;
  const muse = defaultAvatars.find((a) => a.id === "muse")!;

  it("does not inject project-executor tool mandate for creation-only steward", () => {
    expect(effectiveProjectExecutorForPrompt(true, exc)).toBe(false);
  });

  it("keeps project-executor mandate when avatar may patch projects", () => {
    expect(effectiveProjectExecutorForPrompt(true, muse)).toBe(true);
  });

  it("is false when not routing executor", () => {
    expect(effectiveProjectExecutorForPrompt(false, muse)).toBe(false);
  });
});

describe("tool profile vs executor gating", () => {
  const exc = defaultAvatars.find((a) => a.id === "blessed_exchequer")!;
  const muse = defaultAvatars.find((a) => a.id === "muse")!;

  it("Blessed Exchequer uses creation profile when user asks to create an avatar", () => {
    const msg = "please create a new avatar for Ada";
    expect(detectTurnToolIntent(msg)).toBe("creation");
    expect(resolveToolProfile(exc, "creation")).toBe("creation");
  });

  it("Muse stays on general profile for the same user message", () => {
    expect(resolveToolProfile(muse, "creation")).toBe("general");
  });
});
