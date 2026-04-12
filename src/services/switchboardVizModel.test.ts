import { describe, expect, it } from "vitest";
import {
  selectDisplayTrace,
  wavesTopToBottom,
} from "./switchboardVizModel";
import type { CompactTurnRecord, ConversationMessage } from "../types";

const uid = (role: "user" | "avatar", id?: string): ConversationMessage => ({
  id: crypto.randomUUID(),
  role,
  content: "x",
  timestamp: 1,
  ...(role === "avatar" && id ? { avatarId: id } : {}),
});

describe("selectDisplayTrace", () => {
  it("returns live trace while processing when non-empty", () => {
    const live = [
      {
        depth: 0,
        responderIds: ["muse"],
        selection: "default_primary" as const,
      },
    ];
    const t = selectDisplayTrace({
      messages: [uid("user")],
      liveTrace: live,
      processingUserMessageId: "u1",
      turnByUserId: new Map(),
    });
    expect(t).toEqual(live);
  });

  it("returns empty while processing before first wave", () => {
    const archiveTurn: CompactTurnRecord = {
      id: "a1",
      ts: 1,
      userMessageId: "old",
      userPreview: "hi",
      primaryAvatarId: "muse",
      switchboardTrace: [
        {
          depth: 0,
          responderIds: ["muse"],
          selection: "default_primary",
        },
      ],
      replySummary: [],
    };
    const m = new Map<string, CompactTurnRecord>([["old", archiveTurn]]);
    const t = selectDisplayTrace({
      messages: [uid("user"), uid("avatar", "muse")],
      liveTrace: [],
      processingUserMessageId: "new",
      turnByUserId: m,
    });
    expect(t).toEqual([]);
  });

  it("uses last user turn in archive when idle", () => {
    const userId = "user-msg-1";
    const tr = [
      {
        depth: 0,
        responderIds: ["a", "b"],
        selection: "forced_multi" as const,
      },
    ];
    const archiveTurn: CompactTurnRecord = {
      id: "rec1",
      ts: 1,
      userMessageId: userId,
      userPreview: "hi",
      primaryAvatarId: "a",
      routingMode: "forced",
      forcedResponderIds: ["a", "b"],
      switchboardTrace: tr,
      replySummary: [],
    };
    const map = new Map<string, CompactTurnRecord>([[userId, archiveTurn]]);
    const messages: ConversationMessage[] = [
      { id: userId, role: "user", content: "hi", timestamp: 1 },
      {
        id: "r1",
        role: "avatar",
        avatarId: "a",
        content: "ok",
        timestamp: 2,
      },
    ];
    const t = selectDisplayTrace({
      messages,
      liveTrace: null,
      processingUserMessageId: null,
      turnByUserId: map,
    });
    expect(t).toEqual(tr);
  });

  it("returns empty when idle and no archived trace for last user message", () => {
    const userId = "no-archive";
    const messages: ConversationMessage[] = [
      { id: userId, role: "user", content: "hi", timestamp: 1 },
    ];
    const t = selectDisplayTrace({
      messages,
      liveTrace: null,
      processingUserMessageId: null,
      turnByUserId: new Map(),
    });
    expect(t).toEqual([]);
  });
});

describe("wavesTopToBottom", () => {
  it("reverses trace so newest wave is first", () => {
    const a = {
      depth: 0,
      responderIds: ["muse"],
      selection: "default_primary" as const,
    };
    const b = {
      depth: 1,
      responderIds: ["skeptic"],
      selection: "cascade" as const,
    };
    expect(wavesTopToBottom([a, b])).toEqual([b, a]);
  });
});
