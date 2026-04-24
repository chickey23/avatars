import { describe, expect, it } from "vitest";
import { defaultAvatars } from "../data/defaultAvatars";
import { buildOllamaPrompt } from "./avatarAgents";
import { resolveBehaviorTuning } from "./behaviorTuningFormat";
import { renderToolProtocol, resolveToolProfile } from "./agenticTools/toolProtocol";
import { detectTurnToolIntent } from "./turnToolIntent";

describe("buildOllamaPrompt layout", () => {
  const muse = defaultAvatars.find((a) => a.id === "muse")!;
  const tuning = resolveBehaviorTuning({});

  it("places Guidelines before Tool protocol before Recent conversation", () => {
    const userMsg = "hello";
    const turnIntent = detectTurnToolIntent(userMsg);
    const profile = resolveToolProfile(muse, turnIntent);
    const toolBlock = renderToolProtocol(profile, muse);
    const prompt = buildOllamaPrompt(
      muse,
      userMsg,
      [{ role: "user", content: "hi" }],
      [],
      undefined,
      undefined,
      "Brevity rule",
      toolBlock,
      undefined,
      tuning,
      { toolProfile: profile, turnIntent, isExecutor: false }
    );
    const iGuidelines = prompt.indexOf("Guidelines (library rules):");
    const iTool = prompt.indexOf("Tool protocol (machine contract");
    const iRecent = prompt.indexOf("Recent conversation:");
    expect(iGuidelines).toBeGreaterThan(-1);
    expect(iTool).toBeGreaterThan(iGuidelines);
    expect(iRecent).toBeGreaterThan(iTool);
  });

  it("does not put patch_projects example text inside Guidelines", () => {
    const exc = defaultAvatars.find((a) => a.id === "blessed_exchequer")!;
    const toolBlock = renderToolProtocol(
      resolveToolProfile(exc, "creation"),
      exc
    );
    const prompt = buildOllamaPrompt(
      exc,
      "create an avatar for X",
      [],
      [],
      undefined,
      undefined,
      "Brevity",
      toolBlock,
      undefined,
      tuning,
      { toolProfile: "creation", turnIntent: "creation" }
    );
    const guidelinesSlice = prompt.slice(
      prompt.indexOf("Guidelines (library rules):"),
      prompt.indexOf("Tool protocol (machine contract")
    );
    expect(guidelinesSlice).not.toMatch(/world_metadata\.patch_projects/);
    expect(prompt).toMatch(/avatars\.workshop\.open_draft/);
  });
});
