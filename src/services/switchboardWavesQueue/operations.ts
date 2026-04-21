import type { SwitchboardTraceStep } from "../../types";
import type {
  WavesQueueEntry,
  WavesSystemCommandEntry,
  WavesSystemCommandStatus,
  WavesToolErrorEntry,
  WavesWaveEntry,
  WavesWorldviewEntry,
} from "./types";
import { isWaveEntry } from "./types";
import type { WorldviewActivityAction } from "../../types";

/** How many wave rows we already have for this user message (matches trace index for that turn). */
export function countWaveEntriesForUser(
  entries: WavesQueueEntry[],
  userMessageId: string
): number {
  let n = 0;
  for (const e of entries) {
    if (isWaveEntry(e) && e.userMessageId === userMessageId) n++;
  }
  return n;
}

export function appendUserEntry(
  entries: WavesQueueEntry[],
  userMessageId: string
): WavesQueueEntry[] {
  /**
   * Drop stale `no_tools` system-command markers from prior turns: once the
   * user sends the next message, the "0" icons from preceding turns are noise
   * and the visualizer should not carry them forward.
   */
  const pruned = entries.filter(
    (e) => !(e.kind === "system_command" && e.status === "no_tools")
  );
  return [
    ...pruned,
    {
      kind: "user",
      id: crypto.randomUUID(),
      userMessageId,
      createdAt: Date.now(),
    },
  ];
}

export function appendWorldviewEntry(
  entries: WavesQueueEntry[],
  args: {
    userMessageId: string;
    avatarId: string;
    toolSummary: string;
    sourceEmailId?: string;
    parseStatus?: "ok" | "warn";
    parseDetail?: string;
    actions?: WorldviewActivityAction[];
  }
): WavesQueueEntry[] {
  const row: WavesWorldviewEntry = {
    kind: "worldview",
    id: crypto.randomUUID(),
    userMessageId: args.userMessageId,
    createdAt: Date.now(),
    avatarId: args.avatarId,
    toolSummary: args.toolSummary,
    settled: true,
    sourceEmailId: args.sourceEmailId,
    parseStatus: args.parseStatus,
    parseDetail: args.parseDetail,
    actions: args.actions,
  };
  return [...entries, row];
}

export function appendToolResolutionErrorEntry(
  entries: WavesQueueEntry[],
  args: {
    userMessageId: string;
    avatarId: string;
    message: string;
    detail?: string;
    sourceEmailId?: string;
  }
): WavesQueueEntry[] {
  const row: WavesToolErrorEntry = {
    kind: "tool_error",
    id: crypto.randomUUID(),
    userMessageId: args.userMessageId,
    createdAt: Date.now(),
    avatarId: args.avatarId,
    message: args.message,
    detail: args.detail,
    settled: true,
    sourceEmailId: args.sourceEmailId,
  };
  return [...entries, row];
}

export function appendSystemCommandEntry(
  entries: WavesQueueEntry[],
  args: {
    userMessageId: string;
    avatarId: string;
    status: WavesSystemCommandStatus;
    detail?: string;
    sourceEmailId?: string;
  }
): WavesQueueEntry[] {
  const row: WavesSystemCommandEntry = {
    kind: "system_command",
    id: crypto.randomUUID(),
    userMessageId: args.userMessageId,
    createdAt: Date.now(),
    avatarId: args.avatarId,
    status: args.status,
    detail: args.detail,
    settled: true,
    sourceEmailId: args.sourceEmailId,
  };
  return [...entries, row];
}

/** Append one row per new trace step (tail after prevLen). */
export function appendTraceDelta(
  entries: WavesQueueEntry[],
  userMessageId: string,
  trace: SwitchboardTraceStep[],
  prevLen: number
): WavesQueueEntry[] {
  const tail = trace.slice(prevLen);
  if (tail.length === 0) return entries;
  const additions: WavesWaveEntry[] = tail.map((step) => ({
    kind: "wave",
    id: crypto.randomUUID(),
    userMessageId,
    depth: step.depth,
    selection: step.selection,
    responderIds: [...step.responderIds],
    createdAt: Date.now(),
    settled: false,
  }));
  return [...entries, ...additions];
}

/** Settle every wave row for this user (e.g. turn finished or error cleanup). */
export function markWavesSettledForUser(
  entries: WavesQueueEntry[],
  userMessageId: string
): WavesQueueEntry[] {
  return entries.map((e) => {
    if (
      e.kind === "wave" &&
      e.userMessageId === userMessageId
    ) {
      return { ...e, settled: true };
    }
    return e;
  });
}

/** Settle the wave row matching this user message and cascade depth once its chat is on-screen. */
export function markWaveSettledForUserDepth(
  entries: WavesQueueEntry[],
  userMessageId: string,
  depth: number
): WavesQueueEntry[] {
  return entries.map((e) => {
    if (
      e.kind === "wave" &&
      e.userMessageId === userMessageId &&
      e.depth === depth
    ) {
      return { ...e, settled: true };
    }
    return e;
  });
}

export function countWavesQueueByKind(
  entries: WavesQueueEntry[]
): {
  user: number;
  wave: number;
  worldview: number;
  toolError: number;
  systemCommand: number;
  cmdNoTools: number;
  cmdQueued: number;
  cmdValidated: number;
  cmdApplied: number;
  cmdFailed: number;
} {
  let user = 0;
  let wave = 0;
  let worldview = 0;
  let toolError = 0;
  let systemCommand = 0;
  let cmdNoTools = 0;
  let cmdQueued = 0;
  let cmdValidated = 0;
  let cmdApplied = 0;
  let cmdFailed = 0;
  for (const e of entries) {
    if (e.kind === "user") user++;
    else if (e.kind === "worldview") worldview++;
    else if (e.kind === "tool_error") toolError++;
    else if (e.kind === "system_command") {
      systemCommand++;
      if (e.status === "no_tools") cmdNoTools++;
      else if (e.status === "queued") cmdQueued++;
      else if (e.status === "validated") cmdValidated++;
      else if (e.status === "applied") cmdApplied++;
      else cmdFailed++;
    }
    else wave++;
  }
  return {
    user,
    wave,
    worldview,
    toolError,
    systemCommand,
    cmdNoTools,
    cmdQueued,
    cmdValidated,
    cmdApplied,
    cmdFailed,
  };
}
