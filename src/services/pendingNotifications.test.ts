import { describe, it, expect } from "vitest";
import type { EmailItem } from "../connectors/types";
import type { ConversationMessage, PendingNotification } from "../types";
import { defaultAvatars } from "../data/defaultAvatars";
import {
  scoreAvatarsForNewEmail,
  PROACTIVE_MAX_AVATARS_PER_CLUSTER,
  computeReleasedClusterIds,
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
});
