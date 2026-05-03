import { describe, expect, it } from "vitest";
import {
  extractOllamaJsonObject,
  MAX_OLLAMA_SET_MEMBERS,
  parseOllamaSetMemberJson,
} from "./ollamaSetMemberSuggest";

describe("extractOllamaJsonObject", () => {
  it("returns inner object from markdown fence", () => {
    const raw = 'Here:\n```json\n{"work":"X","members":["a"]}\n```';
    expect(extractOllamaJsonObject(raw)).toBe('{"work":"X","members":["a"]}');
  });

  it("returns slice between first brace and last brace", () => {
    const raw = 'prefix {"members":["y"]} trailing';
    expect(extractOllamaJsonObject(raw)).toBe('{"members":["y"]}');
  });
});

describe("parseOllamaSetMemberJson", () => {
  it("parses work, members, and notes", () => {
    const p = parseOllamaSetMemberJson(
      JSON.stringify({
        work: "The Simpsons",
        members: ["Homer Simpson", "Marge Simpson"],
        notes: "nuclear family",
      })
    );
    expect(p?.work).toBe("The Simpsons");
    expect(p?.members).toEqual(["Homer Simpson", "Marge Simpson"]);
    expect(p?.notes).toBe("nuclear family");
  });

  it("returns null for invalid JSON", () => {
    expect(parseOllamaSetMemberJson("not json")).toBeNull();
  });

  it("returns null when members is not an array", () => {
    expect(parseOllamaSetMemberJson('{"members":"nope"}')).toBeNull();
  });

  it("dedupes case-insensitively", () => {
    const p = parseOllamaSetMemberJson(
      JSON.stringify({
        members: ["Alpha", "alpha", "ALPHA", "Beta"],
      })
    );
    expect(p?.members).toEqual(["Alpha", "Beta"]);
  });

  it("caps member list length", () => {
    const members = Array.from({ length: MAX_OLLAMA_SET_MEMBERS + 5 }, (_, i) => `U${i}`);
    const p = parseOllamaSetMemberJson(JSON.stringify({ members }));
    expect(p?.members.length).toBe(MAX_OLLAMA_SET_MEMBERS);
  });

  it("filters empty and too-long strings", () => {
    const p = parseOllamaSetMemberJson(
      JSON.stringify({
        members: ["", "  ", "x", "y".repeat(200), "Valid Name"],
      })
    );
    expect(p?.members).toEqual(["Valid Name"]);
  });
});
