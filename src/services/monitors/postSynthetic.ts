/**
 * postSyntheticMessage — append a monitor-authored `ConversationMessage` to
 * the active thread without running the chat pipeline. Also enqueues a
 * `monitor_prompt` Waves row so the `?` dot appears in the Waves column.
 *
 * Wiring: `AppContext` calls `setSyntheticPostSink` on mount with a setter
 * that knows how to update `SituationContext.conversationThread` and the
 * waves queue. Monitors call `postSyntheticMessage` with their `MonitorPost`.
 *
 * Dedup: identical `(monitorTag, dedupKey)` pairs are suppressed for a short
 * window so rapid repeated polls do not flood the thread.
 */

import type {
  ConversationMessage,
  NotificationSourceRef,
  SyntheticChatAction,
} from "../../types";
import { appendSessionLog } from "../sessionLog";
import type { MonitorAction, MonitorPost } from "./registry";

export interface SyntheticPostInput {
  avatarId: string;
  monitorTag: string;
  content: string;
  actions?: MonitorAction[];
  sourceRef?: NotificationSourceRef;
  dedupKey?: string;
}

export interface SyntheticPostSinkArgs {
  message: ConversationMessage;
  wavesLabel: string;
  monitorTag: string;
  avatarId: string;
}

type SyntheticPostSink = (args: SyntheticPostSinkArgs) => void;

let sink: SyntheticPostSink | null = null;

export function setSyntheticPostSink(fn: SyntheticPostSink | null): void {
  sink = fn;
}

const DEDUP_WINDOW_MS = 5 * 60 * 1000;
const dedup = new Map<string, number>();

function dedupKeyFor(input: SyntheticPostInput): string {
  const key = input.dedupKey ?? hashContent(input.content);
  return `${input.monitorTag}::${key}`;
}

function hashContent(s: string): string {
  /** FNV-1a 32-bit — not cryptographic; only needs to be stable + fast. */
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

function pruneDedup(now: number): void {
  for (const [k, ts] of dedup) {
    if (now - ts > DEDUP_WINDOW_MS) dedup.delete(k);
  }
}

function makeId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID?.() ?? `syn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Enqueue a synthetic post. Returns `true` if posted, `false` if suppressed
 * by dedup. Silently no-ops (returns `false`) when no sink is registered —
 * monitors may run before AppContext mounts in tests, which is fine.
 */
export function postSyntheticMessage(input: SyntheticPostInput): boolean {
  const now = Date.now();
  pruneDedup(now);
  const key = dedupKeyFor(input);
  const last = dedup.get(key);
  if (last !== undefined && now - last < DEDUP_WINDOW_MS) {
    return false;
  }
  dedup.set(key, now);

  if (!sink) {
    appendSessionLog("monitors", "synthetic_no_sink", {
      level: "info",
      detail: `${input.monitorTag} (buffered as dedup but no sink)`,
    });
    return false;
  }

  const message: ConversationMessage = {
    id: makeId(),
    role: "avatar",
    avatarId: input.avatarId,
    content: input.content,
    timestamp: now,
    synthetic: true,
    monitorTag: input.monitorTag,
    responseRequirement: "satisfied",
    syntheticActions: input.actions?.map((a): SyntheticChatAction => {
      const syn: SyntheticChatAction = {
        id: a.id,
        label: a.label,
        payload: a.payload,
      };
      if (a.hint) syn.hint = a.hint;
      return syn;
    }),
  };
  sink({
    message,
    wavesLabel: input.monitorTag,
    monitorTag: input.monitorTag,
    avatarId: input.avatarId,
  });
  return true;
}

export function postMonitorPost(
  post: MonitorPost,
  monitorName: string
): boolean {
  return postSyntheticMessage({
    avatarId: post.avatarId,
    monitorTag: `monitor:${monitorName}`,
    content: post.content,
    actions: post.actions,
    sourceRef: post.sourceRef,
    dedupKey: post.dedupKey,
  });
}

/** Test-only: clear dedup cache between assertions. */
export function __resetSyntheticPostForTests(): void {
  dedup.clear();
  sink = null;
}
