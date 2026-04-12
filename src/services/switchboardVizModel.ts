/**
 * Pure helpers for Switchboard column UI (tests cover behavior).
 */

import type { CompactTurnRecord, ConversationMessage, SwitchboardTraceStep } from "../types";

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
