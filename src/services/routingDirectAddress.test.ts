import { describe, it, expect } from "vitest";
import {
  looksLikeDirectAddress,
  looksLikeProcessMention,
  distinctiveAppellationTokens,
  getAddressTier,
} from "./routingDirectAddress";
import { defaultAvatars } from "../data/defaultAvatars";

describe("looksLikeDirectAddress", () => {
  it("is true for vocative at message start", () => {
    expect(looksLikeDirectAddress("Mark Antony, what do you think?", "mark antony")).toBe(true);
    expect(looksLikeDirectAddress("  mark antony: hello", "mark antony")).toBe(true);
  });

  it("is true for vocative at line start after newline", () => {
    expect(looksLikeDirectAddress("previous line\nMark Antony, hi", "mark antony")).toBe(true);
  });

  it("is true for early comma vocative within head", () => {
    expect(
      looksLikeDirectAddress("Well Mark Antony, I wanted to ask", "mark antony")
    ).toBe(true);
  });

  it("is false when name appears only mid-sentence", () => {
    expect(
      looksLikeDirectAddress(
        "We discussed whether Mark Antony would agree.",
        "mark antony"
      )
    ).toBe(false);
  });

  it("is false for incidental word not at address position", () => {
    expect(
      looksLikeDirectAddress("the triumvir met in secret", "triumvir")
    ).toBe(false);
  });
});

describe("looksLikeProcessMention", () => {
  it("detects @processName", () => {
    expect(looksLikeProcessMention("hello @accomplice please advise".toLowerCase(), "accomplice")).toBe(
      true
    );
  });
});

describe("distinctiveAppellationTokens", () => {
  it("drops blocklisted title words including general", () => {
    const t = distinctiveAppellationTokens("Triumvir, general, and loyal ally");
    expect(t).toContain("triumvir");
    expect(t).not.toContain("general");
    expect(t).not.toContain("loyal");
  });
});

describe("getAddressTier", () => {
  const accomplice = defaultAvatars.find((a) => a.id === "accomplice")!;
  const skeptic = defaultAvatars.find((a) => a.id === "skeptic")!;

  it("returns Tier A for givenName vocative", () => {
    expect(getAddressTier(accomplice, "mark antony, purely random".toLowerCase())).toBe(2);
  });

  it("returns Tier B for distinctive appellation vocative", () => {
    expect(getAddressTier(accomplice, "Triumvir, hear me out".toLowerCase())).toBe(1);
  });

  it("returns 0 for blocklisted general in prose", () => {
    expect(
      getAddressTier(accomplice, "the general ordered a full retreat from the battlefield".toLowerCase())
    ).toBe(0);
  });

  it("returns Tier A for @processName", () => {
    expect(getAddressTier(accomplice, "hey @accomplice what do you think".toLowerCase())).toBe(2);
  });

  it("returns Tier B for Cynic vocative on skeptic", () => {
    expect(getAddressTier(skeptic, "Cynic, what say you?".toLowerCase())).toBe(1);
  });
});
