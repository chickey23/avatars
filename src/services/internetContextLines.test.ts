import { describe, expect, it } from "vitest";
import {
  extractUrlFromInternetContextLine,
  formatInternetContextLine,
  INTERNET_CONTEXT_LINE_PREFIX,
  internetContextLineDisplayTitle,
  mergePinnedInternetLines,
} from "./internetContextLines";
import type { TargetedSearchHit } from "./targetedSearch";

const sampleHit = (over: Partial<TargetedSearchHit> = {}): TargetedSearchHit => ({
  title: "Example",
  url: "https://example.com/page",
  snippet: "A snippet.",
  source: "wikipedia",
  ...over,
});

describe("formatInternetContextLine", () => {
  it("uses stable prefix and source", () => {
    const line = formatInternetContextLine(sampleHit());
    expect(line.startsWith(`${INTERNET_CONTEXT_LINE_PREFIX} [wikipedia]: Example`)).toBe(
      true
    );
    expect(line).toContain("https://example.com/page");
    expect(line).toContain("A snippet.");
  });
});

describe("mergePinnedInternetLines", () => {
  it("dedupes by URL", () => {
    const a = formatInternetContextLine(sampleHit());
    const b = formatInternetContextLine(
      sampleHit({ title: "Other title", snippet: "x" })
    );
    const merged = mergePinnedInternetLines([a], [b]);
    expect(merged).toHaveLength(1);
  });

  it("appends new URLs", () => {
    const a = formatInternetContextLine(sampleHit());
    const b = formatInternetContextLine(
      sampleHit({ url: "https://other.test/", title: "B" })
    );
    const merged = mergePinnedInternetLines([a], [b]);
    expect(merged).toHaveLength(2);
  });
});

describe("extractUrlFromInternetContextLine", () => {
  it("parses URL from formatted line", () => {
    const line = formatInternetContextLine(sampleHit());
    expect(extractUrlFromInternetContextLine(line)).toBe("https://example.com/page");
  });
});

describe("internetContextLineDisplayTitle", () => {
  it("extracts title from formatted line", () => {
    const line = formatInternetContextLine(sampleHit());
    expect(internetContextLineDisplayTitle(line)).toBe("Example");
  });

  it("falls back for non-standard lines", () => {
    expect(internetContextLineDisplayTitle("  raw note  ")).toBe("raw note");
  });
});
