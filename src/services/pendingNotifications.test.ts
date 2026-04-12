import { describe, it, expect } from "vitest";
import type { EmailItem } from "../connectors/types";
import type { ConversationMessage, PendingNotification } from "../types";
import { defaultAvatars } from "../data/defaultAvatars";
import {
  scoreAvatarsForNewEmail,
  filterProactiveAvatarOffers,
  PROACTIVE_MAX_AVATARS_PER_CLUSTER,
  computeReleasedClusterIds,
  mergeReleasedClusterIds,
  removePendingByClusterIds,
  revisePendingForThread,
  mergeProactiveEvaluation,
} from "./pendingNotifications";
import type { AggregatedData } from "../connectors/index";

function email(id: string, subject: string, snippet: string): EmailItem {
  return {
    id,
    from: "a@b.com",
    subject,
    snippet,
    date: Date.now(),
  };
}

function userMsg(content: string): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    role: "user",
    content,
    timestamp: Date.now(),
  };
}

const emptyAggregated = (): AggregatedData => ({
  email: [],
  calendar: [],
  contacts: [],
  weather: { temp: 0, condition: "", location: "", timestamp: 0 },
  news: [],
});

describe("filterProactiveAvatarOffers", () => {
  it("without focus keeps only top scorer when others lack affinity bonus", () => {
    const offers = [
      {
        avatarId: "a",
        score: 60,
        urgency: "medium" as const,
        affinityBonus: 0,
      },
      {
        avatarId: "b",
        score: 55,
        urgency: "medium" as const,
        affinityBonus: 0,
      },
    ];
    expect(filterProactiveAvatarOffers(offers, false)).toHaveLength(1);
    expect(filterProactiveAvatarOffers(offers, false)[0].avatarId).toBe("a");
  });

  it("respects explicit higher minCombined threshold", () => {
    const offers = [
      {
        avatarId: "a",
        score: 60,
        urgency: "medium" as const,
        affinityBonus: 0,
      },
    ];
    expect(
      filterProactiveAvatarOffers(offers, false, {
        minCombined: 100,
        minAffinity: 5,
      })
    ).toHaveLength(0);
  });

  it("without focus keeps second avatar when affinity bonus is sufficient", () => {
    const offers = [
      {
        avatarId: "a",
        score: 70,
        urgency: "high" as const,
        affinityBonus: 0,
      },
      {
        avatarId: "b",
        score: 50,
        urgency: "medium" as const,
        affinityBonus: 6,
      },
    ];
    const out = filterProactiveAvatarOffers(offers, false);
    expect(out).toHaveLength(2);
    expect(out.map((x) => x.avatarId)).toEqual(["a", "b"]);
  });

  it("with focus keeps multiple avatars without extra affinity", () => {
    const offers = [
      {
        avatarId: "a",
        score: 100,
        urgency: "high" as const,
        affinityBonus: 0,
      },
      {
        avatarId: "b",
        score: 95,
        urgency: "high" as const,
        affinityBonus: 0,
      },
    ];
    expect(filterProactiveAvatarOffers(offers, true)).toHaveLength(2);
  });
});

describe("scoreAvatarsForNewEmail", () => {
  it("returns at most PROACTIVE_MAX_AVATARS_PER_CLUSTER avatars", () => {
    const e = email("1", "hello", "world");
    const ctx = {
      conversationThread: [] as ConversationMessage[],
      recentEvents: [],
      cuesAndTriggers: [],
    };
    const scored = scoreAvatarsForNewEmail(e, ctx, defaultAvatars, undefined);
    expect(scored.length).toBeLessThanOrEqual(PROACTIVE_MAX_AVATARS_PER_CLUSTER);
  });

  it("sorts by score descending", () => {
    const e = email("1", "creative inspiration art", "ideas");
    const ctx = {
      conversationThread: [] as ConversationMessage[],
      recentEvents: [],
      cuesAndTriggers: [],
    };
    const scored = scoreAvatarsForNewEmail(e, ctx, defaultAvatars, undefined);
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].score).toBeGreaterThanOrEqual(scored[i].score);
    }
  });

  it("without focus returns one avatar when all share base score and zero tag overlap", () => {
    const overlapPhrase =
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";
    const e = email("1", overlapPhrase, overlapPhrase);
    const ctx = {
      conversationThread: [userMsg(overlapPhrase)],
      recentEvents: [],
      cuesAndTriggers: [],
    };
    const scored = scoreAvatarsForNewEmail(e, ctx, defaultAvatars, undefined);
    expect(scored.length).toBe(1);
    expect(scored[0].affinityBonus).toBe(0);
  });

  it("without focus returns two avatars when second has tag overlap on email", () => {
    const basePhrase =
      "one two three four five six seven eight nine ten eleven twelve";
    const e = email("1", `${basePhrase} creative action`, basePhrase);
    const ctx = {
      conversationThread: [userMsg(basePhrase)],
      recentEvents: [],
      cuesAndTriggers: [],
    };
    const scored = scoreAvatarsForNewEmail(e, ctx, defaultAvatars, undefined);
    const withAffinity = scored.filter((s) => s.affinityBonus >= 5);
    expect(withAffinity.length).toBeGreaterThanOrEqual(2);
    expect(scored.length).toBeGreaterThanOrEqual(2);
  });
});

describe("computeReleasedClusterIds", () => {
  it("returns cluster when user text overlaps topic", () => {
    const pending: PendingNotification[] = [
      {
        id: "1",
        avatarId: "muse",
        urgency: "medium",
        topicSummary: "wedding invitation from cousin",
        sourceRef: { kind: "email", id: "e1" },
        score: 100,
        createdAt: 1,
        topicClusterId: "email:e1",
      },
    ];
    expect(
      computeReleasedClusterIds("What about the wedding invitation?", pending)
    ).toContain("email:e1");
  });
});

describe("mergeReleasedClusterIds", () => {
  it("includes explicit ids even when user text does not match", () => {
    const pending: PendingNotification[] = [
      {
        id: "1",
        avatarId: "muse",
        urgency: "medium",
        topicSummary: "obscure topic xyzabc",
        sourceRef: { kind: "email", id: "e1" },
        score: 100,
        createdAt: 1,
        topicClusterId: "email:e1",
      },
    ];
    const merged = mergeReleasedClusterIds("hello", pending, ["email:e1"]);
    expect(merged).toContain("email:e1");
  });

  it("dedupes text-derived and explicit cluster ids", () => {
    const pending: PendingNotification[] = [
      {
        id: "1",
        avatarId: "muse",
        urgency: "medium",
        topicSummary: "wedding invitation from cousin",
        sourceRef: { kind: "email", id: "e1" },
        score: 100,
        createdAt: 1,
        topicClusterId: "email:e1",
      },
    ];
    const merged = mergeReleasedClusterIds(
      "What about the wedding invitation?",
      pending,
      ["email:e1"]
    );
    expect(merged.filter((id) => id === "email:e1").length).toBe(1);
  });
});

describe("removePendingByClusterIds", () => {
  it("removes all rows for listed cluster ids", () => {
    const pending: PendingNotification[] = [
      {
        id: "a",
        avatarId: "m1",
        urgency: "medium",
        topicSummary: "t1",
        sourceRef: { kind: "email", id: "e1" },
        score: 1,
        createdAt: 1,
        topicClusterId: "email:e1",
      },
      {
        id: "b",
        avatarId: "m2",
        urgency: "medium",
        topicSummary: "t2",
        sourceRef: { kind: "email", id: "e1" },
        score: 1,
        createdAt: 2,
        topicClusterId: "email:e1",
      },
      {
        id: "c",
        avatarId: "m1",
        urgency: "medium",
        topicSummary: "other",
        sourceRef: { kind: "email", id: "e2" },
        score: 1,
        createdAt: 3,
        topicClusterId: "email:e2",
      },
    ];
    const next = removePendingByClusterIds(pending, ["email:e1"]);
    expect(next).toHaveLength(1);
    expect(next[0].id).toBe("c");
  });
});

describe("revisePendingForThread", () => {
  it("removes pending when user already discussed topic", () => {
    const pending: PendingNotification[] = [
      {
        id: "1",
        avatarId: "muse",
        urgency: "medium",
        topicSummary: "quartz project deadline",
        sourceRef: { kind: "email", id: "e1" },
        score: 100,
        createdAt: 1,
        topicClusterId: "email:e1",
      },
    ];
    const thread = [
      userMsg(
        "We already covered the quartz project and the deadline is fine"
      ),
    ];
    const next = revisePendingForThread(pending, thread);
    expect(next).toHaveLength(0);
  });
});

describe("mergeProactiveEvaluation", () => {
  it("adds notifications for new email ids when scores reach medium+", () => {
    const em = email("new1", "Important", "creative meeting tomorrow");
    const data: AggregatedData = {
      ...emptyAggregated(),
      email: [em],
    };
    const ctx = {
      conversationThread: [],
      recentEvents: [],
      cuesAndTriggers: [],
    };
    const focus = { email: { id: "new1", title: "Important" } };
    const next = mergeProactiveEvaluation(data, ctx, defaultAvatars, focus);
    expect(next.proactiveProcessedEmailIds).toContain("new1");
    expect((next.pendingNotifications?.length ?? 0)).toBeGreaterThan(0);
  });

  it("does not reprocess same email id", () => {
    const em = email("same", "Subj", "body");
    const data: AggregatedData = {
      ...emptyAggregated(),
      email: [em],
    };
    const ctx = {
      conversationThread: [],
      recentEvents: [],
      cuesAndTriggers: [],
      proactiveProcessedEmailIds: ["same"],
      pendingNotifications: [],
    };
    const next = mergeProactiveEvaluation(data, ctx, defaultAvatars, undefined);
    expect(next.pendingNotifications).toHaveLength(0);
  });

  it("respects behaviorTuning proactiveMinCombinedScore when strict", () => {
    const overlapPhrase =
      "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima";
    const em = email("strict1", overlapPhrase, overlapPhrase);
    const data: AggregatedData = {
      ...emptyAggregated(),
      email: [em],
    };
    const ctxLoose = {
      conversationThread: [userMsg(overlapPhrase)],
      recentEvents: [],
      cuesAndTriggers: [],
    };
    const nextLoose = mergeProactiveEvaluation(
      data,
      ctxLoose,
      defaultAvatars,
      undefined
    );
    const ctxStrict = {
      ...ctxLoose,
      behaviorTuning: { proactiveMinCombinedScore: 95 },
    };
    const nextStrict = mergeProactiveEvaluation(
      data,
      ctxStrict,
      defaultAvatars,
      undefined
    );
    expect((nextLoose.pendingNotifications?.length ?? 0)).toBeGreaterThan(0);
    expect(nextStrict.pendingNotifications ?? []).toHaveLength(0);
  });
});
