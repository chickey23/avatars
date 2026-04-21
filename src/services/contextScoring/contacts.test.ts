import { describe, it, expect } from "vitest";
import type { Contact } from "../../connectors/types";
import type { ConversationMessage } from "../../types";
import {
  scoreContactItems,
  scoreAndFormatContacts,
  shouldInjectSocialSoloHint,
  CONTACT_CONTEXT_TOP_K,
} from "./contacts";

function msg(role: "user" | "avatar", content: string): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
  };
}

function person(
  id: string,
  name: string,
  email?: string,
  birthday?: string
): Contact {
  return { id, name, email, birthday };
}

describe("scoreContactItems", () => {
  it("boosts contact that matches focus contact id", () => {
    const contacts = [
      person("p1", "Alice"),
      person("p2", "Bob"),
    ];
    const ctx = {
      focus: { contact: { id: "p2", title: "Bob" } },
      conversationThread: [] as ConversationMessage[],
    };
    const scored = scoreContactItems(contacts, ctx);
    const byId = Object.fromEntries(scored.map((s) => [s.contact.id, s.score]));
    expect(byId["p2"]).toBeGreaterThan(byId["p1"]);
  });

  it("boosts overlap with recent user message", () => {
    const contacts = [
      person("a", "Zed Zed"),
      person("b", "Quartz Chen", "q@x.com"),
    ];
    const ctx = {
      conversationThread: [msg("user", "We should email quartz about the roadmap")],
    };
    const scored = scoreContactItems(contacts, ctx);
    const byId = Object.fromEntries(scored.map((s) => [s.contact.id, s.score]));
    expect(byId["b"]).toBeGreaterThan(byId["a"]);
  });

  it("uses activeTask in corpus", () => {
    const contacts = [
      person("x", "Pat"),
      person("y", "Sam", "sam@co.test"),
    ];
    const ctx = {
      conversationThread: [] as ConversationMessage[],
      activeTask: "onboarding sam from co",
    };
    const scored = scoreContactItems(contacts, ctx);
    const byId = Object.fromEntries(scored.map((s) => [s.contact.id, s.score]));
    expect(byId["y"]).toBeGreaterThan(byId["x"]);
  });

  it("includes overlay text in blob for overlap", () => {
    const contacts = [person("u1", "Alex", "a@b.com")];
    const ctx = {
      conversationThread: [msg("user", "Ask the phoenix lead about rollout")],
      contactOverlayById: { u1: "phoenix project lead" },
    };
    const without = scoreContactItems(contacts, {
      conversationThread: ctx.conversationThread,
    });
    const withOverlay = scoreContactItems(contacts, ctx);
    expect(withOverlay[0].score).toBeGreaterThan(without[0].score);
  });
});

describe("scoreAndFormatContacts", () => {
  it("truncates to topK", () => {
    const contacts = Array.from({ length: 10 }, (_, i) =>
      person(`id${i}`, `Name${i}`)
    );
    const lines = scoreAndFormatContacts(contacts, { conversationThread: [] }, 3);
    expect(lines).toHaveLength(3);
  });

  it("defaults topK to CONTACT_CONTEXT_TOP_K", () => {
    const contacts = Array.from({ length: CONTACT_CONTEXT_TOP_K + 3 }, (_, i) =>
      person(`id${i}`, `N${i}`)
    );
    const lines = scoreAndFormatContacts(contacts, { conversationThread: [] });
    expect(lines).toHaveLength(CONTACT_CONTEXT_TOP_K);
  });

  it("ranks focus match first with score 100", () => {
    const contacts = [
      person("low", "Zzz"),
      person("hi", "Important", "hi@x.com"),
    ];
    const lines = scoreAndFormatContacts(contacts, {
      focus: { contact: { id: "hi", title: "Important" } },
      conversationThread: [],
    });
    expect(lines[0]).toContain("rank 1");
    expect(lines[0]).toContain("score 100");
    expect(lines[0]).toContain("Important");
  });

  it("returns empty for empty input", () => {
    expect(scoreAndFormatContacts([], { conversationThread: [] })).toEqual([]);
  });
});

describe("shouldInjectSocialSoloHint", () => {
  it("is false when a contact is focused", () => {
    const contacts = [person("a", "Nobody")];
    expect(
      shouldInjectSocialSoloHint(contacts, {
        focus: { contact: { id: "a", title: "Nobody" } },
        conversationThread: [],
      })
    ).toBe(false);
  });

  it("is true when top contacts all score zero and no contact focus", () => {
    const contacts = [
      person("a", "Xyz Abc"),
      person("b", "Def Ghi"),
    ];
    expect(
      shouldInjectSocialSoloHint(contacts, { conversationThread: [] }, 5)
    ).toBe(true);
  });
});
