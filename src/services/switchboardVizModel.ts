/**
 * Pure helpers for Switchboard column UI (tests cover behavior).
 */

import type { CompactTurnRecord, ConversationMessage, SwitchboardTraceStep } from "../types";
import type {
  WavesQueueEntry,
  WavesSystemCommandEntry,
  WavesSystemCommandStatus,
  WavesWorldviewEntry,
} from "./switchboardWavesQueue/types";
import { isSystemCommandEntry, isWorldviewEntry } from "./switchboardWavesQueue/types";

/** Pairs of consecutive statuses for the same (user, avatar) that are one in-flight row updating (incl. legacy Q,V,+ stacks). */
const LEGACY_SYSTEM_CMD_IN_FLIGHT: ReadonlySet<string> = new Set(
  [
    ["queued" as const, "validated" as const],
    ["queued" as const, "failed" as const],
    ["validated" as const, "applied" as const],
    ["validated" as const, "failed" as const],
    ["applied" as const, "failed" as const],
  ].map(([a, b]) => `${a}\0${b}`)
);

function inFlightSubsumes(
  from: WavesSystemCommandStatus,
  to: WavesSystemCommandStatus
): boolean {
  return LEGACY_SYSTEM_CMD_IN_FLIGHT.has(`${from}\0${to}`);
}

export type SwitchboardVizRow =
  | { kind: "entry"; entry: WavesQueueEntry }
  | {
      kind: "applied_plus_worldview";
      system: WavesSystemCommandEntry;
      worldview: WavesWorldviewEntry;
    };

/**
 * Pre-schema rows may list Q, V, + as three consecutive system_command entries;
 * coalesce to the final status in one slot.
 */
export function normalizeConsecutiveSystemCommands(
  entries: WavesQueueEntry[]
): WavesQueueEntry[] {
  const out: WavesQueueEntry[] = [];
  for (const e of entries) {
    const prev = out[out.length - 1];
    if (
      isSystemCommandEntry(e) &&
      prev &&
      isSystemCommandEntry(prev) &&
      e.userMessageId === prev.userMessageId &&
      e.avatarId === prev.avatarId &&
      inFlightSubsumes(prev.status, e.status)
    ) {
      out[out.length - 1] = e;
    } else {
      out.push(e);
    }
  }
  return out;
}

/** Merges applied + immediately following same-turn worldview (diamond) into one list row. */
export function buildSwitchboardVizRows(
  entries: WavesQueueEntry[]
): SwitchboardVizRow[] {
  const norm = normalizeConsecutiveSystemCommands(entries);
  const rows: SwitchboardVizRow[] = [];
  for (let i = 0; i < norm.length; i++) {
    const e = norm[i]!;
    if (
      isSystemCommandEntry(e) &&
      e.status === "applied" &&
      i + 1 < norm.length
    ) {
      const w = norm[i + 1]!;
      if (
        isWorldviewEntry(w) &&
        w.userMessageId === e.userMessageId &&
        w.avatarId === e.avatarId
      ) {
        rows.push({ kind: "applied_plus_worldview", system: e, worldview: w });
        i++;
        continue;
      }
    }
    rows.push({ kind: "entry", entry: e });
  }
  return rows;
}

export function selectDisplayTrace(args: {
  messages: ConversationMessage[];
  liveTrace: SwitchboardTraceStep[] | null;
  processingUserMessageId: string | null;
  turnByUserId: Map<string, CompactTurnRecord>;
}): SwitchboardTraceStep[] {
  if (args.processingUserMessageId) {
    const live = args.liveTrace;
    if (live && live.length > 0) return live;
    return [];
  }
  for (let i = args.messages.length - 1; i >= 0; i--) {
    const m = args.messages[i];
    if (m.role === "user") {
      const t = args.turnByUserId.get(m.id);
      if (t?.switchboardTrace?.length) return t.switchboardTrace;
    }
  }
  return [];
}

/** Surface at top: newest wave first in the array (top of column). */
export function wavesTopToBottom(trace: SwitchboardTraceStep[]): SwitchboardTraceStep[] {
  return [...trace].reverse();
}
