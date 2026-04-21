import { describe, it, expect } from "vitest";
import {
  formatRelevantDataForOllamaPrompt,
  EMAIL_BODY_RELEVANCE_PREFIX,
} from "./relevantContextPrompt";

describe("formatRelevantDataForOllamaPrompt", () => {
  it("includes all email body lines even when other lines exceed the cap", () => {
    const filler = Array.from({ length: 30 }, (_, i) => `line ${i}`);
    const bodies = [
      `${EMAIL_BODY_RELEVANCE_PREFIX}id1]:\nhello`,
      `${EMAIL_BODY_RELEVANCE_PREFIX}id2]:\nworld`,
    ];
    const relevant = [...filler, ...bodies];
    const out = formatRelevantDataForOllamaPrompt(relevant);
    expect(out).toContain("line 0");
    expect(out).toContain("line 24");
    expect(out).not.toContain("line 25");
    expect(out).toContain("hello");
    expect(out).toContain("world");
    expect(out).toContain("id1");
    expect(out).toContain("id2");
  });

  it("returns empty when no relevant lines", () => {
    expect(formatRelevantDataForOllamaPrompt(undefined)).toBe("");
    expect(formatRelevantDataForOllamaPrompt([])).toBe("");
  });

  it("truncates very long email body blocks", () => {
    const huge = "x".repeat(20_000);
    const line = `${EMAIL_BODY_RELEVANCE_PREFIX}big]:\n${huge}`;
    const out = formatRelevantDataForOllamaPrompt([line]);
    expect(out.length).toBeLessThan(huge.length);
    expect(out).toContain("[truncated for prompt size]");
  });

  it("keeps all email [id …] rank lines even when other lines hit the cap first", () => {
    const filler = Array.from({ length: 30 }, (_, i) => `cal ${i}`);
    const emailLines = [
      "email [id msgA, rank 1, score 90]: Subj — snip (from a@b)",
      "email [id msgB, rank 2, score 80]: Subj2 — snip2 (from c@d)",
    ];
    const relevant = [...filler, ...emailLines];
    const out = formatRelevantDataForOllamaPrompt(relevant);
    expect(out).toContain("cal 0");
    expect(out).toContain("cal 24");
    expect(out).not.toContain("cal 25");
    expect(out).toContain("msgA");
    expect(out).toContain("msgB");
  });
});
