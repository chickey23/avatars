import type { SwitchboardSelection, WorldviewActivityAction } from "../../types";

export const WAVES_QUEUE_SCHEMA_VERSION = 2 as const;

/** Shared fields for persisted queue rows (`kind` discriminates). */
export type WavesQueueEntryBase = {
  id: string;
  userMessageId: string;
  createdAt: number;
};

export type WavesUserEntry = WavesQueueEntryBase & {
  kind: "user";
};

export type WavesWaveEntry = WavesQueueEntryBase & {
  kind: "wave";
  depth: number;
  selection: SwitchboardSelection;
  responderIds: string[];
  /** False until that wave’s avatar replies are shown in the chat (per depth); finally may force-settle leftovers. */
  settled: boolean;
};

/** Worldview tool activity for this user turn (not a routing wave). */
export type WavesWorldviewEntry = WavesQueueEntryBase & {
  kind: "worldview";
  avatarId: string;
  /** Short label, e.g. comma-separated tool names */
  toolSummary: string;
  settled: true;
  sourceEmailId?: string;
  /** Present when tools failed to parse (host heuristics). */
  parseStatus?: "ok" | "warn";
  parseDetail?: string;
  /** Per-tool non-secret summaries (schema v2+). */
  actions?: WorldviewActivityAction[];
};

/** Lexical or tool execution could not be resolved (separate from JSON parse warn). */
export type WavesToolErrorEntry = WavesQueueEntryBase & {
  kind: "tool_error";
  avatarId: string;
  message: string;
  detail?: string;
  /** Stable tool id when known (e.g. gmail.fetch_message_body, lexical). */
  toolId?: string;
  /** Machine-oriented code (e.g. permission_denied, malformed). */
  errorCode?: string;
  /** Truncated non-secret args (JSON or line preview). */
  argsPreview?: string;
  settled: true;
  sourceEmailId?: string;
};

export type WavesSystemCommandStatus =
  | "no_tools"
  | "queued"
  | "validated"
  | "applied"
  | "failed";

/** Deferred system-command lifecycle state for a turn/avatar. */
export type WavesSystemCommandEntry = WavesQueueEntryBase & {
  kind: "system_command";
  avatarId: string;
  status: WavesSystemCommandStatus;
  detail?: string;
  settled: true;
  sourceEmailId?: string;
};

/**
 * Monitor-authored synthetic post. Renders as a question-mark dot in the
 * Waves column. `userMessageId` points to the synthetic ConversationMessage
 * id so clicking can scroll the chat to it.
 */
export type WavesMonitorPromptEntry = WavesQueueEntryBase & {
  kind: "monitor_prompt";
  avatarId: string;
  monitorTag: string;
  /** Short label for a11y and tooltip, mirrors the chat bubble chip. */
  label: string;
  settled: true;
};

export type WavesQueueEntry =
  | WavesUserEntry
  | WavesWaveEntry
  | WavesWorldviewEntry
  | WavesToolErrorEntry
  | WavesSystemCommandEntry
  | WavesMonitorPromptEntry;

export function isUserEntry(e: WavesQueueEntry): e is WavesUserEntry {
  return e.kind === "user";
}

export function isWaveEntry(e: WavesQueueEntry): e is WavesWaveEntry {
  return e.kind === "wave";
}

export function isWorldviewEntry(e: WavesQueueEntry): e is WavesWorldviewEntry {
  return e.kind === "worldview";
}

export function isToolErrorEntry(e: WavesQueueEntry): e is WavesToolErrorEntry {
  return e.kind === "tool_error";
}

export function isSystemCommandEntry(
  e: WavesQueueEntry
): e is WavesSystemCommandEntry {
  return e.kind === "system_command";
}

export function isMonitorPromptEntry(
  e: WavesQueueEntry
): e is WavesMonitorPromptEntry {
  return e.kind === "monitor_prompt";
}

export type WavesQueueDoc = {
  schemaVersion: typeof WAVES_QUEUE_SCHEMA_VERSION;
  entries: WavesQueueEntry[];
};

export function createEmptyWavesQueueDoc(): WavesQueueDoc {
  return { schemaVersion: WAVES_QUEUE_SCHEMA_VERSION, entries: [] };
}
