import { describe, expect, it } from "vitest";
import {
  mergeWikiPlainTextsForExtraction,
  parseAvatarExtractionJson,
  stripMarkdownJsonFence,
} from "./avatarCreationFromWikiSources";

describe("stripMarkdownJsonFence", () => {
  it("removes json fence", () => {
    expect(
      stripMarkdownJsonFence('```json\n{"a":1}\n```')
    ).toBe('{"a":1}');
  });
});

describe("mergeWikiPlainTextsForExtraction", () => {
  it("joins sections and applies max length", () => {
    const out = mergeWikiPlainTextsForExtraction(
      [
        { title: "One", url: "https://en.wikipedia.org/wiki/One", text: "alpha" },
        { title: "Two", url: "https://en.wikipedia.org/wiki/Two", text: "beta" },
      ],
      500
    );
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out).toContain("alpha");
    expect(out).toContain("beta");
  });

  it("truncates merged corpus to maxChars", () => {
    const out = mergeWikiPlainTextsForExtraction(
      [{ title: "T", url: "https://x", text: "z".repeat(100) }],
      50
    );
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.length).toBeGreaterThan(0);
  });
});

describe("parseAvatarExtractionJson", () => {
  it("accepts fenced JSON with required avatar keys", () => {
    const raw = `\`\`\`json
{"givenName":"Ada","appellation":"","description":"Mathematician.","personality":"Analytical","tags":["math"],"interests":["computing"],"accentColor":"","portraitImageUrl":""}
\`\`\``;
    const r = parseAvatarExtractionJson(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.givenName).toBe("Ada");
      expect(r.value.description).toContain("Mathematician");
      expect(r.value.tags).toEqual(["math"]);
    }
  });

  it("normalizes 3-digit hex", () => {
    const r = parseAvatarExtractionJson(
      '{"givenName":"X","appellation":"","description":"Long enough description text for the useful prefill threshold here.","personality":"","tags":[],"interests":[],"accentColor":"#abc","portraitImageUrl":""}'
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.accentColor).toBe("#aabbcc");
    }
  });

  it("rejects when no object", () => {
    const r = parseAvatarExtractionJson("not json");
    expect(r.ok).toBe(false);
  });
});
