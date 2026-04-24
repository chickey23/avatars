import { describe, expect, it } from "vitest";
import { detectTurnToolIntent } from "./turnToolIntent";

describe("detectTurnToolIntent", () => {
  it.each([
    ["please create a new avatar for Cyborg", "creation"],
    ["Would you make an avatar for Stewie?", "creation"],
    ["open the creation workshop", "creation"],
    ["remember that I like tea", "fact_save"],
    ["update my profile with my new job", "fact_save"],
    ["add a new project called Alpha", "fact_save"],
    ["fetch the full email body for this message", "email_fetch"],
    ["hello there", "none"],
  ] as const)("classifies %p as %s", (msg, expected) => {
    expect(detectTurnToolIntent(msg)).toBe(expected);
  });
});
