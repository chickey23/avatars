import { describe, expect, it } from "vitest";
import {
  formatOllamaClosingInstruction,
  resolveBehaviorTuning,
  type ResolvedBehaviorTuning,
} from "./behaviorTuningFormat";

const highFocusTuning: ResolvedBehaviorTuning = {
  ...resolveBehaviorTuning({ behaviorTuning: { replyContextFocus: 70 } }),
};

describe("formatOllamaClosingInstruction", () => {
  it("adds creation mandate when profile+intent match", () => {
    const s = formatOllamaClosingInstruction("Exchequer", highFocusTuning, {
      toolProfile: "creation",
      turnIntent: "creation",
      isExecutor: false,
    });
    expect(s).toMatch(/avatars\.workshop\.open_draft/);
    expect(s).toMatch(/avatars_tools_v1/);
  });

  it("adds email fetch mandate", () => {
    const s = formatOllamaClosingInstruction("Muse", highFocusTuning, {
      toolProfile: "gmail_fetch",
      turnIntent: "email_fetch",
    });
    expect(s).toMatch(/gmail\.fetch_message_body/);
  });

  it("supports legacy boolean isExecutor", () => {
    const s = formatOllamaClosingInstruction("Muse", highFocusTuning, true);
    expect(s).toMatch(/routing \*\*executor\*\*/);
  });
});
