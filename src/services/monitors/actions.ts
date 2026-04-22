/**
 * Inline-action handler registry. Monitors that emit `syntheticActions`
 * register handlers here during module init. When the user clicks an inline
 * button on a synthetic chat message, the App chat renderer looks up
 * `${monitorTag}::${actionId}` and dispatches.
 */

import type { ConversationMessage, SyntheticChatAction } from "../../types";
import { appendSessionLog } from "../sessionLog";

export interface SyntheticActionContext {
  message: ConversationMessage;
  action: SyntheticChatAction;
}

export type SyntheticActionHandler = (
  ctx: SyntheticActionContext
) => void | Promise<void>;

const handlers = new Map<string, SyntheticActionHandler>();

function keyFor(monitorTag: string, actionId: string): string {
  return `${monitorTag}::${actionId}`;
}

export function registerSyntheticAction(
  monitorTag: string,
  actionId: string,
  handler: SyntheticActionHandler
): void {
  handlers.set(keyFor(monitorTag, actionId), handler);
}

export function runSyntheticAction(
  message: ConversationMessage,
  action: SyntheticChatAction
): void | Promise<void> {
  if (!message.monitorTag) {
    appendSessionLog("monitors", "synthetic_action_no_tag", {
      level: "warn",
      detail: action.id,
    });
    return;
  }
  const fn = handlers.get(keyFor(message.monitorTag, action.id));
  if (!fn) {
    appendSessionLog("monitors", "synthetic_action_unknown", {
      level: "warn",
      detail: `${message.monitorTag}::${action.id}`,
    });
    return;
  }
  try {
    return fn({ message, action });
  } catch (err) {
    appendSessionLog("monitors", "synthetic_action_failed", {
      level: "warn",
      detail: `${message.monitorTag}::${action.id}: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

/** Test-only reset. */
export function __resetSyntheticActionsForTests(): void {
  handlers.clear();
}
