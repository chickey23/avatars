import { describe, expect, it } from "vitest";
import {
  appendSystemCommandEntry,
  appendToolResolutionErrorEntry,
  appendTraceDelta,
  appendUserEntry,
  appendWorldviewEntry,
  countWaveEntriesForUser,
  countWavesQueueByKind,
  markWavesSettledForUser,
  markWaveSettledForUserDepth,
} from "./operations";
import { migrateWavesQueueDoc } from "./persist";
import type { WavesQueueEntry } from "./types";

describe("switchboardWavesQueue operations", () => {
  it("appendUserEntry appends a user row", () => {
    const next = appendUserEntry([], "u1");
    expect(next).toHaveLength(1);
    expect(next[0]?.kind).toBe("user");
    if (next[0]?.kind === "user") expect(next[0].userMessageId).toBe("u1");
  });

  it("appendTraceDelta appends only new steps", () => {
    const trace = [
      {
        depth: 0,
        responderIds: ["a"],
        selection: "default_primary" as const,
      },
      {
        depth: 1,
        responderIds: ["b"],
        selection: "cascade" as const,
      },
    ];
    let e: WavesQueueEntry[] = [];
    e = appendTraceDelta(e, "u1", trace, 0);
    expect(e.filter((x) => x.kind === "wave")).toHaveLength(2);
    e = appendTraceDelta(e, "u1", trace, 2);
    expect(e.filter((x) => x.kind === "wave")).toHaveLength(2);
  });

  it("markWavesSettledForUser settles wave rows", () => {
    const entries: WavesQueueEntry[] = [
      {
        kind: "wave",
        id: "w1",
        userMessageId: "u1",
        depth: 0,
        selection: "default_primary",
        responderIds: ["muse"],
        createdAt: 1,
        settled: false,
      },
    ];
    const next = markWavesSettledForUser(entries, "u1");
    expect(next[0]?.kind === "wave" && next[0].settled).toBe(true);
  });

  it("markWaveSettledForUserDepth settles only matching depth", () => {
    const entries: WavesQueueEntry[] = [
      {
        kind: "wave",
        id: "w0",
        userMessageId: "u1",
        depth: 0,
        selection: "default_primary",
        responderIds: ["a"],
        createdAt: 1,
        settled: false,
      },
      {
        kind: "wave",
        id: "w1",
        userMessageId: "u1",
        depth: 1,
        selection: "cascade",
        responderIds: ["b"],
        createdAt: 2,
        settled: false,
      },
    ];
    const next = markWaveSettledForUserDepth(entries, "u1", 0);
    expect(next[0]?.kind === "wave" && next[0].settled).toBe(true);
    expect(next[1]?.kind === "wave" && next[1].settled).toBe(false);
  });

  it("countWaveEntriesForUser matches appended waves for a user id", () => {
    let e: WavesQueueEntry[] = [];
    e = appendUserEntry(e, "u1");
    e = appendTraceDelta(
      e,
      "u1",
      [
        {
          depth: 0,
          responderIds: ["a"],
          selection: "default_primary",
        },
        {
          depth: 1,
          responderIds: ["b"],
          selection: "cascade",
        },
      ],
      0
    );
    expect(countWaveEntriesForUser(e, "u1")).toBe(2);
    expect(countWaveEntriesForUser(e, "u2")).toBe(0);
  });

  it("countWavesQueueByKind counts user vs wave", () => {
    let e: WavesQueueEntry[] = [];
    e = appendUserEntry(e, "u1");
    e = appendTraceDelta(
      e,
      "u1",
      [
        {
          depth: 0,
          responderIds: ["a"],
          selection: "default_primary",
        },
      ],
      0
    );
    expect(countWavesQueueByKind(e)).toEqual({
      user: 1,
      wave: 1,
      worldview: 0,
      toolError: 0,
      systemCommand: 0,
      cmdNoTools: 0,
      cmdQueued: 0,
      cmdValidated: 0,
      cmdApplied: 0,
      cmdFailed: 0,
    });
  });

  it("appendWorldviewEntry adds a worldview row", () => {
    let e: WavesQueueEntry[] = appendUserEntry([], "u1");
    e = appendWorldviewEntry(e, {
      userMessageId: "u1",
      avatarId: "muse",
      toolSummary: "user_profile.patch",
    });
    const c = countWavesQueueByKind(e);
    expect(c.user).toBe(1);
    expect(c.worldview).toBe(1);
    expect(c.wave).toBe(0);
    expect(c.toolError).toBe(0);
  });

  it("appendToolResolutionErrorEntry counts as toolError", () => {
    let e: WavesQueueEntry[] = appendUserEntry([], "u1");
    e = appendToolResolutionErrorEntry(e, {
      userMessageId: "u1",
      avatarId: "muse",
      message: "gmail.fetch_message_body: not allowlisted",
    });
    expect(countWavesQueueByKind(e)).toEqual({
      user: 1,
      wave: 0,
      worldview: 0,
      toolError: 1,
      systemCommand: 0,
      cmdNoTools: 0,
      cmdQueued: 0,
      cmdValidated: 0,
      cmdApplied: 0,
      cmdFailed: 0,
    });
  });

  it("appendSystemCommandEntry counts lifecycle status buckets", () => {
    let e: WavesQueueEntry[] = appendUserEntry([], "u1");
    e = appendSystemCommandEntry(e, {
      userMessageId: "u1",
      avatarId: "muse",
      status: "queued",
    });
    e = appendSystemCommandEntry(e, {
      userMessageId: "u1",
      avatarId: "muse",
      status: "validated",
    });
    e = appendSystemCommandEntry(e, {
      userMessageId: "u1",
      avatarId: "muse",
      status: "failed",
    });
    expect(countWavesQueueByKind(e)).toEqual({
      user: 1,
      wave: 0,
      worldview: 0,
      toolError: 0,
      systemCommand: 3,
      cmdNoTools: 0,
      cmdQueued: 1,
      cmdValidated: 1,
      cmdApplied: 0,
      cmdFailed: 1,
    });
  });

  it("appendUserEntry drops prior no_tools system-command markers", () => {
    let e: WavesQueueEntry[] = appendUserEntry([], "u1");
    e = appendSystemCommandEntry(e, {
      userMessageId: "u1",
      avatarId: "muse",
      status: "no_tools",
    });
    e = appendSystemCommandEntry(e, {
      userMessageId: "u1",
      avatarId: "muse",
      status: "applied",
    });
    expect(countWavesQueueByKind(e)).toMatchObject({
      cmdNoTools: 1,
      cmdApplied: 1,
      systemCommand: 2,
    });
    e = appendUserEntry(e, "u2");
    const c = countWavesQueueByKind(e);
    expect(c.cmdNoTools).toBe(0);
    expect(c.cmdApplied).toBe(1);
    expect(c.systemCommand).toBe(1);
    expect(c.user).toBe(2);
  });

  it("migrateWavesQueueDoc upgrades v1 to v2", () => {
    const doc = migrateWavesQueueDoc({
      schemaVersion: 1,
      entries: [
        {
          kind: "user",
          id: "x",
          userMessageId: "u",
          createdAt: 1,
        },
      ],
    });
    expect(doc.schemaVersion).toBe(2);
    expect(doc.entries).toHaveLength(1);
  });
});
