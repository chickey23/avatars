import { describe, it, expect, beforeEach } from "vitest";
import {
  dedupeWorldviewToolCalls,
  hoistInlineLexicalLines,
  parseLexicalAgenticLines,
  scanLexicalMalformedTriggers,
  stripLexicalToolSyntaxFromVisible,
  stripMarkdownFencedBlocks,
} from "./lexicalParse";
import { ensureWorldMetadataLoaded, replaceUserProfile } from "../worldMetadata/store";

describe("lexicalParse", () => {
  beforeEach(() => {
    ensureWorldMetadataLoaded();
    replaceUserProfile({ displayName: "", pronouns: "", notes: "", updatedAt: 0 });
  });

  it("stripMarkdownFencedBlocks removes fences", () => {
    const s = "hello\n```json\n{}\n```\nAVATARS_MEM: note";
    expect(stripMarkdownFencedBlocks(s)).toContain("AVATARS_MEM:");
  });

  it("parses AVATARS_MEM into user_profile.patch", () => {
    const tools = parseLexicalAgenticLines("AVATARS_MEM: likes tea\nAVATARS_MEM: second fact");
    expect(tools.some((t) => t.name === "user_profile.patch")).toBe(true);
    const patch = tools.find((t) => t.name === "user_profile.patch");
    const p = patch?.args.patch as { notes?: string };
    expect(p?.notes).toContain("likes tea");
    expect(p?.notes).toContain("second fact");
  });

  it("parses gmail fetch line", () => {
    const tools = parseLexicalAgenticLines(
      "AVATARS_TOOL name=gmail.fetch_message_body messageId=abc123"
    );
    expect(tools).toEqual([
      {
        name: "gmail.fetch_message_body",
        args: { messageId: "abc123" },
      },
    ]);
  });

  it("dedupeWorldviewToolCalls drops duplicate name+args", () => {
    const a = dedupeWorldviewToolCalls([
      { name: "user_profile.patch", args: { patch: { notes: "x" } } },
      { name: "user_profile.patch", args: { patch: { notes: "x" } } },
    ]);
    expect(a.length).toBe(1);
  });

  it("hoistInlineLexicalLines splits inline AVATARS_MEM for parsing", () => {
    const raw = "Hello there? AVATARS_MEM: likes Pink Floyd";
    const hoisted = hoistInlineLexicalLines(raw);
    expect(hoisted).toContain("Hello there?");
    expect(hoisted).toContain("AVATARS_MEM: likes Pink Floyd");
    const tools = parseLexicalAgenticLines(raw);
    expect(tools.some((t) => t.name === "user_profile.patch")).toBe(true);
  });

  it("stripLexicalToolSyntaxFromVisible removes mem and fetch syntax", () => {
    expect(
      stripLexicalToolSyntaxFromVisible("Hello.\nAVATARS_MEM: note\n")
    ).toBe("Hello.");
    expect(
      stripLexicalToolSyntaxFromVisible(
        "Question?\nAVATARS_TOOL name=gmail.fetch_message_body messageId=abc"
      )
    ).toBe("Question?");
    expect(
      stripLexicalToolSyntaxFromVisible(
        "Yes, concert. AVATARS_MEM: durable note about taste."
      )
    ).toBe("Yes, concert.");
  });

  it("scanLexicalMalformedTriggers flags bad lines", () => {
    expect(scanLexicalMalformedTriggers("AVATARS_MEM:")).toContain(
      "AVATARS_MEM with empty body"
    );
    expect(
      scanLexicalMalformedTriggers("AVATARS_TOOL name=gmail.fetch_message_body")
        .length
    ).toBeGreaterThan(0);
  });
});
