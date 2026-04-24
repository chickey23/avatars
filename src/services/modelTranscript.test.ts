import { describe, expect, it } from "vitest";
import { scrubTranscriptForModel, shouldScrubAvatarLineForModel } from "./modelTranscript";

describe("scrubTranscriptForModel", () => {
  it("redacts avatar lines with wikipedia.search imitation", () => {
    const scrubbed = scrubTranscriptForModel([
      { role: "user", content: "create an avatar for X" },
      {
        role: "avatar",
        content: 'I use wikipedia.search(q="X") for you.',
      },
    ]);
    expect(scrubbed[0]!.content).toContain("create");
    expect(scrubbed[1]!.content).toBe("[tool attempt redacted]");
  });

  it("keeps clean avatar replies", () => {
    const line = "Welcome. I shall open the workshop for you.";
    expect(shouldScrubAvatarLineForModel(line)).toBe(false);
    const scrubbed = scrubTranscriptForModel([{ role: "avatar", content: line }]);
    expect(scrubbed[0]!.content).toBe(line);
  });
});
