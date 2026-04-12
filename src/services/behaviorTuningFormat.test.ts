import { describe, it, expect } from "vitest";
import {
  resolveBehaviorTuning,
  formatBehaviorTuningForOllama,
  formatBehaviorTuningRulesPrefix,
  compressRulesBodyForEngagement,
  DEFAULT_REPLY_CONTEXT_FOCUS,
} from "./behaviorTuningFormat";

describe("resolveBehaviorTuning", () => {
  it("fills defaults when behaviorTuning missing", () => {
    const r = resolveBehaviorTuning({});
    expect(r.replyContextFocus).toBe(DEFAULT_REPLY_CONTEXT_FOCUS);
    expect(r.userMoodNote).toBe("");
  });

  it("clamps proactive scores", () => {
    const r = resolveBehaviorTuning({
      behaviorTuning: { proactiveMinCombinedScore: 200, proactiveMinAffinityBonus: -5 },
    });
    expect(r.proactiveMinCombinedScore).toBe(95);
    expect(r.proactiveMinAffinityBonus).toBe(0);
  });
});

describe("formatBehaviorTuningForOllama", () => {
  it("includes mood note when set", () => {
    const t = resolveBehaviorTuning({
      behaviorTuning: { userMoodNote: "overwhelmed" },
    });
    expect(formatBehaviorTuningForOllama(t)).toContain("overwhelmed");
  });

  it("high context focus mentions context over flourish", () => {
    const t = resolveBehaviorTuning({
      behaviorTuning: { replyContextFocus: 80 },
    });
    expect(formatBehaviorTuningForOllama(t).toLowerCase()).toContain(
      "theatrical"
    );
  });
});

describe("formatBehaviorTuningRulesPrefix", () => {
  it("includes mood and context snippet for high focus", () => {
    const t = resolveBehaviorTuning({
      behaviorTuning: {
        userMoodNote: "tired",
        replyContextFocus: 80,
      },
    });
    const p = formatBehaviorTuningRulesPrefix(t, {
      relevantData: ["email [rank 1]: Budget — Q4 numbers"],
    });
    expect(p).toContain("tired");
    expect(p).toContain("Budget");
  });
});

describe("compressRulesBodyForEngagement", () => {
  it("truncates to first sentence when engagement low", () => {
    const t = resolveBehaviorTuning({
      behaviorTuning: { userEngagementLevel: 20 },
    });
    const out = compressRulesBodyForEngagement(
      t,
      "First sentence here. Second should drop."
    );
    expect(out).toBe("First sentence here.");
  });
});
