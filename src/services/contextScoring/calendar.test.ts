import { describe, it, expect } from "vitest";
import type { CalendarEvent } from "../../connectors/types";
import type { ConversationMessage } from "../../types";
import {
  scoreCalendarEvents,
  scoreAndFormatCalendarEvents,
  CALENDAR_CONTEXT_TOP_K,
} from "./calendar";

function msg(role: "user" | "avatar", content: string): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: Date.now(),
  };
}

function ev(
  id: string,
  title: string,
  start: number,
  location?: string
): CalendarEvent {
  return { id, title, start, end: start + 3600_000, location };
}

describe("scoreCalendarEvents", () => {
  it("boosts event that matches focus calendar id", () => {
    const t = Date.now();
    const events = [
      ev("c1", "Alpha", t),
      ev("c2", "Beta", t + 1),
    ];
    const ctx = {
      focus: { calendar: { id: "c2", title: "Beta" } },
      conversationThread: [] as ConversationMessage[],
    };
    const scored = scoreCalendarEvents(events, ctx);
    const byId = Object.fromEntries(scored.map((s) => [s.event.id, s.score]));
    expect(byId["c2"]).toBeGreaterThan(byId["c1"]);
  });

  it("boosts overlap with recent user message", () => {
    const t = Date.now();
    const events = [
      ev("a", "Unrelated", t),
      ev("b", "Phoenix roadmap review", t + 1),
    ];
    const ctx = {
      conversationThread: [msg("user", "Let's align on the phoenix roadmap today")],
    };
    const scored = scoreCalendarEvents(events, ctx);
    const byId = Object.fromEntries(scored.map((s) => [s.event.id, s.score]));
    expect(byId["b"]).toBeGreaterThan(byId["a"]);
  });

  it("uses activeTask in corpus", () => {
    const t = Date.now();
    const events = [
      ev("x", "Standup", t),
      ev("y", "Sprint planning", t + 1),
    ];
    const ctx = {
      conversationThread: [] as ConversationMessage[],
      activeTask: "sprint planning facilitation",
    };
    const scored = scoreCalendarEvents(events, ctx);
    const byId = Object.fromEntries(scored.map((s) => [s.event.id, s.score]));
    expect(byId["y"]).toBeGreaterThan(byId["x"]);
  });
});

describe("scoreAndFormatCalendarEvents", () => {
  it("truncates to topK", () => {
    const base = Date.now();
    const events = Array.from({ length: 10 }, (_, i) =>
      ev(`id${i}`, `E${i}`, base + i * 60_000)
    );
    const lines = scoreAndFormatCalendarEvents(events, { conversationThread: [] }, 3);
    expect(lines).toHaveLength(3);
  });

  it("defaults topK to CALENDAR_CONTEXT_TOP_K", () => {
    const base = Date.now();
    const events = Array.from({ length: CALENDAR_CONTEXT_TOP_K + 3 }, (_, i) =>
      ev(`id${i}`, `E${i}`, base + i * 60_000)
    );
    const lines = scoreAndFormatCalendarEvents(events, { conversationThread: [] });
    expect(lines).toHaveLength(CALENDAR_CONTEXT_TOP_K);
  });

  it("ranks focus match first with score 100", () => {
    const t = Date.now();
    const events = [
      ev("low", "Zzz", t),
      ev("hi", "Important", t + 60_000),
    ];
    const lines = scoreAndFormatCalendarEvents(events, {
      focus: { calendar: { id: "hi", title: "Important" } },
      conversationThread: [],
    });
    expect(lines[0]).toContain("rank 1");
    expect(lines[0]).toContain("score 100");
    expect(lines[0]).toContain("Important");
  });

  it("returns empty for empty input", () => {
    expect(scoreAndFormatCalendarEvents([], { conversationThread: [] })).toEqual([]);
  });
});
