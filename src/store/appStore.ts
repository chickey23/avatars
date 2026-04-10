/**
 * App store - Situation Context, avatars, and conversation state.
 * Local-first: persists to localStorage when possible.
 */

import type {
  SituationContext,
  SituationFocus,
  Avatar,
  AvatarAgentResult,
  ConversationMessage,
} from "../types";
import {
  createEmptyContext,
  appendToConversation,
  focusToRelevanceStrings,
} from "../services/situationContext";
import { defaultAvatars } from "../data/defaultAvatars";
import { distributeAndRespond } from "../services/switchboard";
import { appendTurn, buildCompactTurnRecord } from "../services/turnArchive";
import {
  gatherDataFromSources,
  dataToRelevanceStringsWithoutEmail,
} from "../connectors";
import { scoreAndFormatCalendarEvents } from "../services/contextScoring/calendar";
import { scoreAndFormatContacts } from "../services/contextScoring/contacts";
import { scoreAndFormatEmails } from "../services/contextScoring/email";
import {
  getContactOverlayById,
  ensureWorldMetadataLoaded,
} from "../services/worldMetadata/store";
import {
  mergeProactiveEvaluation,
  computeReleasedClusterIds,
} from "../services/pendingNotifications";

const STORAGE_KEY = "avatars_situation_context";

function loadPersistedContext(): SituationContext | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed as SituationContext;
  } catch {
    return null;
  }
}

/** Do not persist ephemeral routing fields. */
export function stripEphemeralFields(ctx: SituationContext): SituationContext {
  const { replyToUserMessageId: _, pendingReleaseClusterIds: __, ...rest } = ctx;
  return rest;
}

/** Persist context after proactive merge or external updates (strips ephemeral fields). */
export function writePersistedContext(ctx: SituationContext): void {
  persistContext(stripEphemeralFields(ctx));
}

function persistContext(ctx: SituationContext): void {
  try {
    const clean = stripEphemeralFields(ctx);
    const toStore = {
      ...clean,
      conversationThread: clean.conversationThread.slice(-100),
      recentEvents: clean.recentEvents.slice(-20),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    /* ignore */
  }
}

/** Persisted partial update (e.g. Well of Souls fields). */
export function patchSituationContext(
  ctx: SituationContext,
  patch: Partial<SituationContext>
): SituationContext {
  const next = stripEphemeralFields({ ...ctx, ...patch });
  persistContext(next);
  return next;
}

function conversationMessageFromAvatarResult(
  avatarId: string,
  r: AvatarAgentResult
): ConversationMessage {
  return {
    id: crypto.randomUUID(),
    role: "avatar",
    avatarId,
    content: r.content,
    timestamp: Date.now(),
    replySource: r.replySource,
    promptDebug: r.promptDebug,
    replyError: r.replyError,
    rulesSkipReason: r.rulesSkipReason,
  };
}

export interface AppStoreState {
  situationContext: SituationContext;
  avatars: Avatar[];
  selectedAvatarId: string;
}

export function getInitialState(): AppStoreState {
  ensureWorldMetadataLoaded();
  const persisted = loadPersistedContext();
  const avatars = defaultAvatars;
  return {
    situationContext: persisted ?? createEmptyContext(),
    avatars,
    selectedAvatarId: avatars[0]?.id ?? "",
  };
}

/** Clear visible conversation; keeps turn archive and other context fields. */
export function clearChat(situationContext: SituationContext): SituationContext {
  const next = {
    ...situationContext,
    conversationThread: [] as ConversationMessage[],
    recentEvents: [] as string[],
    pendingNotifications: [],
    proactiveProcessedEmailIds: [],
  };
  persistContext(next);
  return next;
}

export type UserTurnJob = {
  userMsgId: string;
  content: string;
  focus?: SituationFocus;
};

/**
 * Run gather + switchboard for one user message that is already in the thread.
 * Uses latest `getContext()` so later user lines are in the prompt; `replyToUserMessageId`
 * targets routing / "User just said" to this turn.
 */
export async function processUserTurn(
  getContext: () => SituationContext,
  job: UserTurnJob,
  selectedAvatarId: string,
  avatars: Avatar[],
  onProgress?: (situationContext: SituationContext) => void
): Promise<void> {
  const ctx = getContext();
  const data = await gatherDataFromSources();
  const ctxAfterProactive = mergeProactiveEvaluation(
    data,
    ctx,
    avatars,
    job.focus ?? ctx.userFocus
  );
  const releasedClusterIds = computeReleasedClusterIds(
    job.content,
    ctxAfterProactive.pendingNotifications ?? []
  );
  const focusStrings = focusToRelevanceStrings(job.focus ?? {});
  const wos = ctx.useWellOfSoulsInChat && ctx.wellOfSoulsRules?.trim();
  const wosLines = wos
    ? [`Well of Souls (personality rules draft):\n${ctx.wellOfSoulsRules!.trim()}`]
    : [];
  const emailLines = scoreAndFormatEmails(data.email, {
    focus: job.focus,
    conversationThread: ctx.conversationThread,
    activeTask: ctx.activeTask,
  });
  const calendarLines = scoreAndFormatCalendarEvents(data.calendar, {
    focus: job.focus,
    conversationThread: ctx.conversationThread,
    activeTask: ctx.activeTask,
  });
  const contactLines = scoreAndFormatContacts(data.contacts, {
    focus: job.focus,
    conversationThread: ctx.conversationThread,
    activeTask: ctx.activeTask,
    contactOverlayById: getContactOverlayById(),
  });
  const relevantData = [
    ...wosLines,
    ...focusStrings,
    ...emailLines,
    ...calendarLines,
    ...contactLines,
    ...dataToRelevanceStringsWithoutEmail(data),
  ];

  const working: SituationContext = {
    ...ctxAfterProactive,
    relevantData,
    replyToUserMessageId: job.userMsgId,
    pendingReleaseClusterIds:
      releasedClusterIds.length > 0 ? releasedClusterIds : undefined,
  };

  let updatedContext = working;

  const { responses, trace } = await distributeAndRespond(
    working,
    avatars,
    selectedAvatarId,
    3,
    {
      onAvatarComplete: ({ avatarId, result }) => {
        const avatarMsg = conversationMessageFromAvatarResult(avatarId, result);
        updatedContext = appendToConversation(updatedContext, avatarMsg);
        onProgress?.(stripEphemeralFields(updatedContext));
      },
    }
  );

  appendTurn(
    buildCompactTurnRecord(
      job.userMsgId,
      job.content.trim(),
      job.focus,
      selectedAvatarId,
      trace,
      responses
    )
  );

  persistContext(stripEphemeralFields(updatedContext));
  onProgress?.(stripEphemeralFields(updatedContext));
}
