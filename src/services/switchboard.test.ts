import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { defaultAvatars } from "../data/defaultAvatars";
import { createEmptyContext } from "./situationContext";
import {
  pickRespondersForUserMessage,
  evaluateRelevanceWithMeta,
  distributeAndRespond,
  scoreTaskMatchForAvatar,
} from "./switchboard";
import type { SituationContext } from "../types";
import type { LongTermTask } from "./longTermTasks";
import { embedWithOllama } from "./ollama";

vi.mock("./avatarAgents", () => ({
  runAvatarAgent: vi.fn(async (avatar: { id: string }) => ({
    content: `reply-${avatar.id}`,
    replySource: "rules" as const,
    rulesSkipReason: "unavailable" as const,
  })),
}));

vi.mock("./ollama", () => ({
  embedWithOllama: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(embedWithOllama).mockResolvedValue({ ok: false, error: "test" });
});

afterEach(() => {
  vi.mocked(embedWithOllama).mockReset();
});

describe("pickRespondersForUserMessage", () => {
  it("falls back to first avatar when no tag/interest match", () => {
    const r = pickRespondersForUserMessage("xyz unrelated text", defaultAvatars);
    expect(r.selection).toBe("default_primary");
    expect(r.responderIds).toEqual([defaultAvatars[0].id]);
  });

  it("returns up to K tag/interest matches sorted by score", () => {
    const r = pickRespondersForUserMessage(
      "creative art imagination and logic evidence",
      defaultAvatars
    );
    expect(r.selection).toBe("tag_interest_match");
    expect(r.responderIds.length).toBeGreaterThan(1);
    expect(r.responderIds.length).toBeLessThanOrEqual(3);
    expect(new Set(r.responderIds).size).toBe(r.responderIds.length);
  });

  it("boosts avatar when user message overlaps an active long-term task title", () => {
    const tasks: LongTermTask[] = [
      {
        id: "t1",
        avatarId: "skeptic",
        title: "verify ledger totals",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    const r = pickRespondersForUserMessage(
      "please check verify ledger totals when you can",
      defaultAvatars,
      3,
      tasks
    );
    expect(r.selection).toBe("tag_interest_match");
    expect(r.responderIds[0]).toBe("skeptic");
  });

  it("prioritizes vocative givenName over other avatars", () => {
    const r = pickRespondersForUserMessage(
      "Mark Antony, purely random qwerty",
      defaultAvatars
    );
    expect(r.selection).toBe("tag_interest_match");
    expect(r.responderIds[0]).toBe("accomplice");
  });

  it("prioritizes distinctive appellation vocative (Tier B)", () => {
    const r = pickRespondersForUserMessage("Triumvir, hear me out", defaultAvatars);
    expect(r.selection).toBe("tag_interest_match");
    expect(r.responderIds[0]).toBe("accomplice");
  });

  it("does not award title tier for adjective general in prose alone", () => {
    const r = pickRespondersForUserMessage(
      "the general ordered a retreat from the battlefield",
      defaultAvatars
    );
    expect(r.selection).toBe("default_primary");
    expect(r.responderIds[0]).toBe("muse");
  });

  it("routes military topic vocabulary to accomplice", () => {
    const r = pickRespondersForUserMessage(
      "warfare strategy and military campaigns on the frontier",
      defaultAvatars
    );
    expect(r.selection).toBe("tag_interest_match");
    expect(r.responderIds[0]).toBe("accomplice");
  });

  it("lets a specialist win when topic keywords favor them over military", () => {
    const r = pickRespondersForUserMessage(
      "warfare strategy logic evidence assumptions alternatives",
      defaultAvatars
    );
    expect(r.selection).toBe("tag_interest_match");
    expect(r.responderIds[0]).toBe("skeptic");
  });
});

describe("scoreTaskMatchForAvatar", () => {
  it("returns 0 when no tasks", () => {
    const m = new Map<string, LongTermTask[]>();
    expect(scoreTaskMatchForAvatar("muse", "hello", m)).toBe(0);
  });

  it("adds bonus when title substring matches", () => {
    const map = new Map<string, LongTermTask[]>();
    map.set("muse", [
      {
        id: "t1",
        avatarId: "muse",
        title: "draft outline",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    expect(scoreTaskMatchForAvatar("muse", "status of draft outline work", map)).toBe(5);
  });
});

describe("evaluateRelevanceWithMeta", () => {
  it("routes user lines via pickRespondersForUserMessage when embed fails", async () => {
    const userMsg = {
      id: "um1",
      role: "user" as const,
      content: "purely random qwerty",
      timestamp: 1,
    };
    const ctx: SituationContext = {
      ...createEmptyContext(),
      conversationThread: [userMsg],
      replyToUserMessageId: userMsg.id,
    };
    const m = await evaluateRelevanceWithMeta(ctx, defaultAvatars);
    expect(m.selection).toBe("default_primary");
    expect(m.responderIds).toEqual([defaultAvatars[0].id]);
  });

  it("uses semantic_match when Ollama embeddings succeed", async () => {
    let n = 0;
    vi.mocked(embedWithOllama).mockImplementation(async () => {
      n += 1;
      if (n === 1) return { ok: true, embedding: [1, 0, 0] };
      if (n === 4) return { ok: true, embedding: [1, 0, 0] };
      return { ok: true, embedding: [0, 1, 0] };
    });
    const userMsg = {
      id: "um1b",
      role: "user" as const,
      content: "hello there",
      timestamp: 1,
    };
    const ctx: SituationContext = {
      ...createEmptyContext(),
      conversationThread: [userMsg],
      replyToUserMessageId: userMsg.id,
    };
    const m = await evaluateRelevanceWithMeta(ctx, defaultAvatars);
    expect(m.selection).toBe("semantic_match");
    expect(m.responderIds[0]).toBe("skeptic");
  });

  it("semantic_match orders by address tier before cosine similarity", async () => {
    let n = 0;
    vi.mocked(embedWithOllama).mockImplementation(async () => {
      n += 1;
      if (n === 1) return { ok: true, embedding: [1, 0, 0] };
      if (n === 4) return { ok: true, embedding: [1, 0, 0] };
      return { ok: true, embedding: [0, 1, 0] };
    });
    const userMsg = {
      id: "um1c",
      role: "user" as const,
      content: "Mark Antony, hello there",
      timestamp: 1,
    };
    const ctx: SituationContext = {
      ...createEmptyContext(),
      conversationThread: [userMsg],
      replyToUserMessageId: userMsg.id,
    };
    const m = await evaluateRelevanceWithMeta(ctx, defaultAvatars);
    expect(m.selection).toBe("semantic_match");
    expect(m.responderIds[0]).toBe("accomplice");
  });
});

describe("distributeAndRespond", () => {
  it("uses forced_multi for multiple forced ids in wave 1", async () => {
    const userMsg = {
      id: "um2",
      role: "user" as const,
      content: "hi",
      timestamp: 1,
    };
    const ctx: SituationContext = {
      ...createEmptyContext(),
      conversationThread: [userMsg],
      replyToUserMessageId: userMsg.id,
    };
    const { trace, responses } = await distributeAndRespond(
      ctx,
      defaultAvatars,
      ["muse", "skeptic"],
      1
    );
    expect(trace[0]?.selection).toBe("forced_multi");
    expect(trace[0]?.responderIds).toEqual(["muse", "skeptic"]);
    expect(responses.map((r) => r.avatarId)).toEqual(["muse", "skeptic"]);
  });

  it("ignores unknown forced ids", async () => {
    const userMsg = {
      id: "um3",
      role: "user" as const,
      content: "hi",
      timestamp: 1,
    };
    const ctx: SituationContext = {
      ...createEmptyContext(),
      conversationThread: [userMsg],
      replyToUserMessageId: userMsg.id,
    };
    const { trace } = await distributeAndRespond(
      ctx,
      defaultAvatars,
      ["not-an-avatar"],
      1
    );
    expect(trace[0]?.selection).not.toBe("forced_primary");
    expect(trace[0]?.responderIds.length).toBeGreaterThan(0);
  });

  it("fires onTraceProgress after each wave is scheduled", async () => {
    const userMsg = {
      id: "um4",
      role: "user" as const,
      content: "hi",
      timestamp: 1,
    };
    const ctx: SituationContext = {
      ...createEmptyContext(),
      conversationThread: [userMsg],
      replyToUserMessageId: userMsg.id,
    };
    const snapshots: { length: number }[] = [];
    await distributeAndRespond(
      ctx,
      defaultAvatars,
      ["muse"],
      2,
      {
        onTraceProgress: ({ trace }) => snapshots.push({ length: trace.length }),
      }
    );
    expect(snapshots.length).toBeGreaterThanOrEqual(1);
    expect(snapshots[0]?.length).toBe(1);
  });
});
