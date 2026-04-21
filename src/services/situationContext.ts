/**
 * Situation Context - shared state for cascade and contextual awareness.
 * Consumed by Switchboard and Avatar Interface Agents.
 */

import type {
  SituationContext,
  ConversationMessage,
  SituationFocus,
  EmailFocusArtifacts,
} from "../types";

export function createEmptyContext(): SituationContext {
  return {
    conversationThread: [],
    recentEvents: [],
    cuesAndTriggers: [],
  };
}

export function appendToConversation(
  ctx: SituationContext,
  msg: ConversationMessage
): SituationContext {
  return {
    ...ctx,
    conversationThread: [...ctx.conversationThread, msg],
    recentEvents: [
      ...ctx.recentEvents.slice(-9),
      `msg:${msg.role}:${msg.avatarId ?? "user"}:${msg.timestamp}`,
    ],
  };
}

/** Attach Gmail focus prep metadata to an existing user line (after blocking prep). */
export function patchUserMessageEmailFocusArtifacts(
  ctx: SituationContext,
  userMessageId: string,
  artifacts: EmailFocusArtifacts | undefined
): SituationContext {
  if (!artifacts) return ctx;
  return {
    ...ctx,
    conversationThread: ctx.conversationThread.map((m) =>
      m.id === userMessageId && m.role === "user"
        ? { ...m, emailFocusArtifacts: artifacts }
        : m
    ),
  };
}

export function addEvent(ctx: SituationContext, event: string): SituationContext {
  return {
    ...ctx,
    recentEvents: [...ctx.recentEvents.slice(-9), event],
  };
}

export function setActiveTask(ctx: SituationContext, task?: string): SituationContext {
  return { ...ctx, activeTask: task };
}

export function addCue(ctx: SituationContext, cue: string): SituationContext {
  return {
    ...ctx,
    cuesAndTriggers: [...ctx.cuesAndTriggers, cue],
  };
}

export function getRecentConversation(
  ctx: SituationContext,
  lastN: number = 10
): ConversationMessage[] {
  return ctx.conversationThread.slice(-lastN);
}

/**
 * Message Switchboard uses as "last" for routing.
 * When the tail is an avatar message, use it so cascade (avatar → avatar) works.
 * When the tail is a user message and `replyToUserMessageId` is set, use that anchor
 * so a queued turn routes to the correct user line even if newer user lines exist below.
 */
export function getRoutingLastMessage(
  ctx: SituationContext
): ConversationMessage | undefined {
  const thread = ctx.conversationThread;
  if (thread.length === 0) return undefined;
  const tail = thread[thread.length - 1];
  if (tail.role === "avatar") {
    return tail;
  }
  if (ctx.replyToUserMessageId) {
    const found = thread.find((m) => m.id === ctx.replyToUserMessageId);
    if (found) return found;
  }
  return tail;
}

/**
 * Merge focus from a queued job with persisted `userFocus`. Job fields win when present.
 */
export function mergeSituationFocus(
  jobFocus: SituationFocus | undefined,
  persisted: SituationFocus | undefined
): SituationFocus {
  const base = persisted ?? {};
  if (!jobFocus) return { ...base };
  return {
    ...base,
    ...jobFocus,
    email: jobFocus.email !== undefined ? jobFocus.email : base.email,
    calendar:
      jobFocus.calendar !== undefined ? jobFocus.calendar : base.calendar,
    contact: jobFocus.contact !== undefined ? jobFocus.contact : base.contact,
    project: jobFocus.project !== undefined ? jobFocus.project : base.project,
  };
}

/** Encode Focus as relevance strings (prepended to connector data in relevantData). */
export function focusToRelevanceStrings(focus: SituationFocus): string[] {
  const out: string[] = [];
  if (focus.email) {
    out.push(`focus: email [${focus.email.id}] ${focus.email.title}`);
  }
  if (focus.calendar) {
    out.push(`focus: calendar [${focus.calendar.id}] ${focus.calendar.title}`);
  }
  if (focus.contact) {
    out.push(`focus: contact [${focus.contact.id}] ${focus.contact.title}`);
  }
  if (focus.project) {
    out.push(`focus: project [${focus.project.id}] ${focus.project.title}`);
  }
  return out;
}
