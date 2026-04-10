import { describe, it, expect } from "vitest";
import type { EmailItem } from "../../connectors/types";
import type { ConversationMessage } from "../../types";
import {
  scoreEmailItems,
  scoreAndFormatEmails,
  EMAIL_CONTEXT_TOP_K,
} from "./email";

function msg(role: "user" | "avatar", content: string): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
  };
}

function email(
  id: string,
  subject: string,
  snippet: string,
  from = "a@b.com",
  date = Date.now()
): EmailItem {
  return { id, from, subject, snippet, date };
}

describe("scoreEmailItems", () => {
  it("boosts message that matches focus email id", () => {
    const emails = [
      email("e1", "Hello", "body one"),
      email("e2", "Other", "body two"),
    ];
    const ctx = {
      focus: { email: { id: "e2", title: "Other" } },
      conversationThread: [] as ConversationMessage[],
    };
    const scored = scoreEmailItems(emails, ctx);
    const byId = Object.fromEntries(scored.map((s) => [s.email.id, s.score]));
    expect(byId["e2"]).toBeGreaterThan(byId["e1"]);
  });

  it("boosts overlap with recent user message", () => {
    const emails = [
      email("a", "Alpha", "zzz unrelated"),
      email("b", "Beta", "quartz deadline tomorrow"),
    ];
    const ctx = {
      conversationThread: [msg("user", "We need to discuss quartz and deadlines")],
    };
    const scored = scoreEmailItems(emails, ctx);
    const byId = Object.fromEntries(scored.map((s) => [s.email.id, s.score]));
    expect(byId["b"]).toBeGreaterThan(byId["a"]);
  });

  it("uses activeTask in corpus", () => {
    const emails = [
      email("x", "Sub", "nothing"),
      email("y", "Re", "phoenix project status"),
    ];
    const ctx = {
      conversationThread: [] as ConversationMessage[],
      activeTask: "phoenix project rollout",
    };
    const scored = scoreEmailItems(emails, ctx);
    const byId = Object.fromEntries(scored.map((s) => [s.email.id, s.score]));
    expect(byId["y"]).toBeGreaterThan(byId["x"]);
  });
});

describe("scoreAndFormatEmails", () => {
  it("truncates to topK", () => {
    const emails = Array.from({ length: 10 }, (_, i) =>
      email(`id${i}`, `S${i}`, `body ${i}`)
    );
    const lines = scoreAndFormatEmails(emails, { conversationThread: [] }, 3);
    expect(lines).toHaveLength(3);
  });

  it("defaults topK to EMAIL_CONTEXT_TOP_K", () => {
    const emails = Array.from({ length: EMAIL_CONTEXT_TOP_K + 3 }, (_, i) =>
      email(`id${i}`, `S${i}`, `body`)
    );
    const lines = scoreAndFormatEmails(emails, { conversationThread: [] });
    expect(lines).toHaveLength(EMAIL_CONTEXT_TOP_K);
  });

  it("ranks focus match first with score 100", () => {
    const emails = [
      email("low", "Z", "zzz"),
      email("hi", "Important", "read me"),
    ];
    const lines = scoreAndFormatEmails(emails, {
      focus: { email: { id: "hi", title: "Important" } },
      conversationThread: [],
    });
    expect(lines[0]).toContain("rank 1");
    expect(lines[0]).toContain("score 100");
    expect(lines[0]).toContain("Important");
  });

  it("returns empty for empty input", () => {
    expect(scoreAndFormatEmails([], { conversationThread: [] })).toEqual([]);
  });
});
