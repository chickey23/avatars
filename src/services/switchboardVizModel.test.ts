import { describe, expect, it } from "vitest";
import {
  buildSwitchboardVizRows,
  normalizeConsecutiveSystemCommands,
  selectDisplayTrace,
  wavesTopToBottom,
} from "./switchboardVizModel";
import type { WavesQueueEntry } from "./switchboardWavesQueue";
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

describe("normalizeConsecutiveSystemCommands", () => {
  it("merges legacy Q then V then + to one entry", () => {
    const entries: WavesQueueEntry[] = [
      {
        kind: "user",
        id: "u0",
        userMessageId: "um",
        createdAt: 1,
      },
      {
        kind: "system_command",
        id: "a",
        userMessageId: "um",
        createdAt: 1,
        avatarId: "muse",
        status: "queued",
        settled: true,
      },
      {
        kind: "system_command",
        id: "b",
        userMessageId: "um",
        createdAt: 2,
        avatarId: "muse",
        status: "validated",
        settled: true,
      },
      {
        kind: "system_command",
        id: "c",
        userMessageId: "um",
        createdAt: 3,
        avatarId: "muse",
        status: "applied",
        settled: true,
      },
    ];
    const n = normalizeConsecutiveSystemCommands(entries);
    expect(n.filter((e) => e.kind === "system_command")).toHaveLength(1);
    expect(
      n.find((e) => e.kind === "system_command" && e.status === "applied")
    ).toBeTruthy();
  });

  it("does not merge applied with a new queued (cascade)", () => {
    const entries: WavesQueueEntry[] = [
      {
        kind: "system_command",
        id: "a",
        userMessageId: "um",
        createdAt: 1,
        avatarId: "muse",
        status: "applied",
        settled: true,
      },
      {
        kind: "system_command",
        id: "b",
        userMessageId: "um",
        createdAt: 2,
        avatarId: "muse",
        status: "queued",
        settled: true,
      },
    ];
    const n = normalizeConsecutiveSystemCommands(entries);
    expect(n.filter((e) => e.kind === "system_command")).toHaveLength(2);
  });
});

describe("buildSwitchboardVizRows", () => {
  it("merges applied with following worldview for same user and avatar", () => {
    const entries: WavesQueueEntry[] = [
      {
        kind: "system_command",
        id: "s",
        userMessageId: "um",
        createdAt: 1,
        avatarId: "muse",
        status: "applied",
        settled: true,
      },
      {
        kind: "worldview",
        id: "w",
        userMessageId: "um",
        createdAt: 2,
        avatarId: "muse",
        toolSummary: "x",
        settled: true,
        parseStatus: "ok",
      },
    ];
    const rows = buildSwitchboardVizRows(entries);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("applied_plus_worldview");
  });
});
