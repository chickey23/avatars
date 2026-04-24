import type { SwitchboardTraceStep } from "../../types";
import type {
  WavesQueueEntry,
  WavesMonitorPromptEntry,
  WavesSystemCommandEntry,
  WavesSystemCommandStatus,
  WavesToolErrorEntry,
  WavesWaveEntry,
  WavesWorldviewEntry,
} from "./types";
import { isSystemCommandEntry, isWaveEntry } from "./types";
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

const WAVES_TOOL_ERROR_ARGS_MAX = 520;

function clampWavesArgsPreview(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length > WAVES_TOOL_ERROR_ARGS_MAX
    ? `${t.slice(0, WAVES_TOOL_ERROR_ARGS_MAX - 1)}…`
    : t;
}

export function appendToolResolutionErrorEntry(
  entries: WavesQueueEntry[],
  args: {
    userMessageId: string;
    avatarId: string;
    message: string;
    detail?: string;
    toolId?: string;
    errorCode?: string;
    argsPreview?: string;
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
    toolId: args.toolId?.trim() || undefined,
    errorCode: args.errorCode?.trim() || undefined,
    argsPreview: clampWavesArgsPreview(args.argsPreview),
    settled: true,
    sourceEmailId: args.sourceEmailId,
  };
  return [...entries, row];
}

export function appendMonitorPromptEntry(
  entries: WavesQueueEntry[],
  args: {
    userMessageId: string;
    avatarId: string;
    monitorTag: string;
    label: string;
  }
): WavesQueueEntry[] {
  const row: WavesMonitorPromptEntry = {
    kind: "monitor_prompt",
    id: crypto.randomUUID(),
    userMessageId: args.userMessageId,
    createdAt: Date.now(),
    avatarId: args.avatarId,
    monitorTag: args.monitorTag,
    label: args.label,
    settled: true,
  };
  return [...entries, row];
}

/** In-place lifecycle: same (user, avatar) row updates Q→V→+; new `queued` after a terminal status appends a new row (cascade). */
const SYSTEM_CMD_REPLACE_FROM: Record<
  WavesSystemCommandStatus,
  WavesSystemCommandStatus[] | undefined
> = {
  queued: undefined,
  no_tools: undefined,
  validated: ["queued"],
  applied: ["validated"],
  failed: ["queued", "validated", "applied"],
};

function findLastSystemCommandIndex(
  entries: WavesQueueEntry[],
  userMessageId: string,
  avatarId: string
): number {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (
      e &&
      isSystemCommandEntry(e) &&
      e.userMessageId === userMessageId &&
      e.avatarId === avatarId
    ) {
      return i;
    }
  }
  return -1;
}

function canReplaceSystemCommand(
  from: WavesSystemCommandStatus,
  to: WavesSystemCommandStatus
): boolean {
  return SYSTEM_CMD_REPLACE_FROM[to]?.includes(from) ?? false;
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
  if (args.status === "queued" || args.status === "no_tools") {
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

  const idx = findLastSystemCommandIndex(
    entries,
    args.userMessageId,
    args.avatarId
  );
  if (idx < 0) {
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

  const existing = entries[idx] as WavesSystemCommandEntry;
  if (!canReplaceSystemCommand(existing.status, args.status)) {
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

  const next = entries.slice();
  const row: WavesSystemCommandEntry = {
    kind: "system_command",
    id: existing.id,
    userMessageId: args.userMessageId,
    createdAt: existing.createdAt,
    avatarId: args.avatarId,
    status: args.status,
    detail: args.detail,
    settled: true,
    sourceEmailId: args.sourceEmailId,
  };
  next[idx] = row;
  return next;
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
  monitorPrompt: number;
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
  let monitorPrompt = 0;
  let cmdNoTools = 0;
  let cmdQueued = 0;
  let cmdValidated = 0;
  let cmdApplied = 0;
  let cmdFailed = 0;
  for (const e of entries) {
    if (e.kind === "user") user++;
    else if (e.kind === "worldview") worldview++;
    else if (e.kind === "tool_error") toolError++;
    else if (e.kind === "monitor_prompt") monitorPrompt++;
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
    monitorPrompt,
    cmdNoTools,
    cmdQueued,
    cmdValidated,
    cmdApplied,
    cmdFailed,
  };
}
