import { describe, it, expect } from "vitest";
import {
  diagnoseWorldviewToolReply,
  formatWorldviewParseDiagnosisForLog,
} from "./diagnose";
import type { WorldviewToolsEnvelope } from "./parse";

const validEnvelope: WorldviewToolsEnvelope = {
  schema: "avatars_tools_v1",
  tools: [{ name: "user_profile.patch", args: { patch: {} } }],
};

describe("diagnoseWorldviewToolReply", () => {
  it("returns empty when envelope has tools", () => {
    const d = diagnoseWorldviewToolReply("anything", validEnvelope);
    expect(d.hints).toEqual([]);
    expect(d.reason).toBeNull();
  });

  it("detects informal user profile label (Nyota-style transcript)", () => {
    const raw = `I think I can help. user profile.patch: { "displayName": "Nyota Uhura" } world_metadata.patch_projects { "p1": {} }`;
    const d = diagnoseWorldviewToolReply(raw, null);
    expect(d.hints.length).toBeGreaterThan(0);
    expect(d.hints.some((h) => /user_profile\.patch/i.test(h))).toBe(true);
    expect(d.reason).toBeTruthy();
  });

  it("detects inline patch_projects brace block", () => {
    const d = diagnoseWorldviewToolReply(
      'Done. world_metadata.patch_projects {"x":{"title":"T"}}',
      null
    );
    expect(d.hints.some((h) => /avatars_tools_v1/i.test(h))).toBe(true);
  });

  it("does not flag normal chat without tool-like patterns", () => {
    const d = diagnoseWorldviewToolReply(
      "Just a note about user profiles in general settings.",
      null
    );
    expect(d.hints).toEqual([]);
  });

  it("formats log detail with cap", () => {
    const long = { hints: ["a".repeat(300), "b".repeat(300)], reason: "x" };
    const s = formatWorldviewParseDiagnosisForLog(long);
    expect(s.length).toBeLessThanOrEqual(400);
  });
});
