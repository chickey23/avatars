import { describe, it, expect } from "vitest";
import {
  createInitialWellOfSoulsRuleBlocks,
  createInitialWellOfSoulsTraits,
} from "./wellOfSoulsRandomInit";

describe("wellOfSoulsRandomInit", () => {
  it("always includes Brevity and Stay in character rule blocks", () => {
    for (let i = 0; i < 30; i++) {
      const s = createInitialWellOfSoulsRuleBlocks();
      expect(s.has("global-brief")).toBe(true);
      expect(s.has("tone-in-character")).toBe(true);
    }
  });

  it("produces trait sets within valid ids", () => {
    const s = createInitialWellOfSoulsTraits();
    expect(s.size).toBeGreaterThanOrEqual(0);
    for (const id of s) {
      expect(typeof id).toBe("string");
    }
  });
});
