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
  SwitchboardTraceStep,
  WorldviewActivityAction,
  EmailFocusArtifacts,
} from "../types";
import {
  createEmptyContext,
  appendToConversation,
  focusToRelevanceStrings,
  mergeSituationFocus,
  patchUserMessageEmailFocusArtifacts,
} from "../services/situationContext";
import { suggestActiveTaskFromUserMessage } from "../services/activeTaskAgent";
import { runUserTurnPreprocessor } from "../services/preprocessor/userTurnPreprocessor";
import { projectMetadataContextLines } from "../services/worldMetadata/relevance";
import { resolveContextEntryBudgets } from "../utils/contextEntryBudget";
import { distributeAndRespond } from "../services/switchboard";
import { appendSessionLog } from "../services/sessionLog";
import { appendTurn, buildCompactTurnRecord } from "../services/turnArchive";
import { dataToRelevanceStringsWithoutEmail } from "../connectors";
import { fetchGmailMessageBody } from "../connectors/gmail";
import {
  buildEmailFocusContextLines,
  runEmailFocusPrep,
  type EmailFocusPrepResult,
} from "../services/emailInsights";
import { gmailThreadWebUrl } from "../utils/gmailWebUrl";
import { scoreAndFormatCalendarEvents } from "../services/contextScoring/calendar";
import {
  scoreAndFormatContacts,
  shouldInjectSocialSoloHint,
  SOCIAL_SOLO_HEURISTIC_LINE,
} from "../services/contextScoring/contacts";
import {
  buildFocusCorpusAppendix,
  buildFocusSoftSignals,
  FOCUS_EMAIL_BODY_EXCERPT_MAX,
} from "../services/contextScoring/focusRelevance";
import {
  rankEmailsLinesAndDiagnostics,
  selectStrongMatchBodyPrefetchIds,
} from "../services/contextScoring/email";
import { sanitizeAvatarVisibleReply } from "../services/worldviewTools/parse";
import {
  getContactOverlayById,
  ensureWorldMetadataLoaded,
  getWorldMetadata,
} from "../services/worldMetadata/store";
import { userProfileToRelevanceLines } from "../services/worldMetadata/userProfileRelevance";
import { buildWorldMetadataScoringCorpus } from "../services/worldMetadata/scoringCorpus";
import {
  mergeProactiveEvaluation,
  mergeReleasedClusterIds,
  removePendingByClusterIds,
} from "../services/pendingNotifications";
import { resolvePrimarySlotCount } from "./primaryRoster";
import { getFullAvatarCatalog } from "./avatarCatalog";
import {
  initRosterScoresIfNeeded,
  resolveExecutorAvatarId,
  getSortedCoreAvatars,
  listPopInAvatarIdsForProjectFocus,
} from "../services/avatarRoster";
import {
  platformFocusedProjectBlock,
  filterOutSystemAvatars,
  gatherDataFromCacheFirst,
  isSystemAvatarId,
} from "../services/platform";
import type { WavesSystemCommandStatus } from "../services/switchboardWavesQueue";

const STORAGE_KEY = "avatars_situation_context";

type LoadedSituation = SituationContext & { contextEntryDepthT?: number };

function migrateLoadedContext(parsed: LoadedSituation): SituationContext {
  if (
    typeof parsed.contextEntryDepthT === "number" &&
    parsed.contextEntryDepth == null
  ) {
    const v = parsed.contextEntryDepthT;
    const { contextEntryDepthT: _legacyT, ...rest } = parsed;
    return {
      ...rest,
      contextEntryDepth: {
        email: v,
        calendar: v,
        contacts: v,
        projects: v,
      },
    };
  }
  return parsed;
}

function loadPersistedContext(): SituationContext | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LoadedSituation;
    return migrateLoadedContext(parsed);
  } catch {
    return null;
  }
}

/** Do not persist ephemeral routing fields. */
export function stripEphemeralFields(ctx: SituationContext): SituationContext {
  const {
    replyToUserMessageId: _,
    pendingReleaseClusterIds: __,
    turnEmailFetchAllowlist: ___,
    switchboardRoutingMode: ____,
    preflightOllamaMinScore: _____,
    executorAvatarIdForTurn: ______,
    lastEmailRankingDiagnostics: _______,
    ...rest
  } = ctx;
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
): ConversationMessage | null {
  if (r.suppressUserMessage) {
    return null;
  }
  const content =
    r.replySource === "ollama" || r.replySource === "fallback"
      ? sanitizeAvatarVisibleReply(r.content)
      : r.content;
  return {
    id: crypto.randomUUID(),
    role: "avatar",
    avatarId,
    content,
    timestamp: Date.now(),
    replySource: r.replySource,
    promptDebug: r.promptDebug,
    replyError: r.replyError,
    rulesSkipReason: r.rulesSkipReason,
  };
}

export interface AppStoreState {
  situationContext: SituationContext;
  /** Empty = switchboard routing; non-empty = those avatars reply in wave 1. */
  selectedAvatarIds: string[];
}

export function getInitialState(): AppStoreState {
  ensureWorldMetadataLoaded();
  const persisted = loadPersistedContext();
  let situationContext = persisted ?? createEmptyContext();
  const catalog = getFullAvatarCatalog(situationContext);
  const hadRosterInit = situationContext.avatarRosterScoresInitialized === true;
  situationContext = initRosterScoresIfNeeded(situationContext, catalog);
  if (!hadRosterInit && situationContext.avatarRosterScoresInitialized) {
    persistContext(stripEphemeralFields(situationContext));
  }
  const routable = filterOutSystemAvatars(catalog);
  const slotCount = resolvePrimarySlotCount(situationContext, routable.length);
  const active = getSortedCoreAvatars(
    routable,
    situationContext.avatarRosterPriorityScoreById,
    slotCount
  );
  const firstId = active[0]?.id;
  return {
    situationContext,
    selectedAvatarIds: firstId ? [firstId] : [],
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
  /** Force these clusters to "released" in the prompt (e.g. sidebar Discuss). */
  releasedClusterIds?: string[];
  /** Override primary avatar for this turn only (Discuss from another card). */
  primaryAvatarId?: string;
};

/** Core roster plus pop-in avatars (managed project focus) so Switchboard can run them. */
function routingAvatarsForSwitchboard(
  catalog: Avatar[],
  ctx: SituationContext,
  slotCount: number
): Avatar[] {
  const routable = filterOutSystemAvatars(catalog);
  const core = getSortedCoreAvatars(routable, ctx.avatarRosterPriorityScoreById, slotCount);
  const popIds = listPopInAvatarIdsForProjectFocus(ctx.userFocus?.project?.id);
  const seen = new Set(core.map((a) => a.id));
  const extra: Avatar[] = [];
  for (const id of popIds) {
    if (seen.has(id)) continue;
    const a = routable.find((c) => c.id === id);
    if (a) {
      seen.add(id);
      extra.push(a);
    }
  }
  return [...core, ...extra];
}

/** Ensures talk-to / forced ids are in the wave roster (UI can show a selected avatar outside core slots). */
function switchboardAvatarsIncludingForced(
  routingAvatars: Avatar[],
  catalog: Avatar[],
  forcedResponderIds: string[] | undefined
): Avatar[] {
  if (!forcedResponderIds?.length) return routingAvatars;
  const seen = new Set(routingAvatars.map((a) => a.id));
  const extras: Avatar[] = [];
  for (const id of forcedResponderIds) {
    if (seen.has(id)) continue;
    const a = catalog.find((c) => c.id === id);
    if (a) {
      seen.add(id);
      extras.push(a);
    }
  }
  return extras.length > 0 ? [...routingAvatars, ...extras] : routingAvatars;
}

export type ProcessUserTurnUiHooks = {
  /** Incremental Switchboard trace while `distributeAndRespond` runs (wave scheduled). */
  onTraceProgress?: (args: {
    trace: SwitchboardTraceStep[];
    userMessageId: string;
  }) => void;
  /** That wave’s avatar replies are in the thread (chat column shows them). */
  onWaveChatComplete?: (args: {
    userMessageId: string;
    depth: number;
  }) => void;
  /** Worldview tools applied from an avatar Ollama reply. */
  onWorldviewActivity?: (args: {
    avatarId: string;
    userMessageId: string;
    toolNames: string[];
    actions?: WorldviewActivityAction[];
    sourceEmailId?: string;
  }) => void;
  /** Lexical / tool execution issue (one row per message string). */
  onToolResolutionError?: (args: {
    avatarId: string;
    userMessageId: string;
    message: string;
    detail?: string;
    toolId?: string;
    errorCode?: string;
    argsPreview?: string;
    sourceEmailId?: string;
  }) => void;
  /** Heuristic: model tried tools but reply did not parse as avatars_tools_v1. */
  onWorldviewParseDiagnostic?: (args: {
    avatarId: string;
    userMessageId: string;
    hints: string[];
    reason: string | null;
    sourceEmailId?: string;
  }) => void;
  /** Deferred system-command lifecycle for visualizer/debug. */
  onSystemCommandStatus?: (args: {
    avatarId: string;
    userMessageId: string;
    status: WavesSystemCommandStatus;
    detail?: string;
    sourceEmailId?: string;
  }) => void;
};

/**
 * Run gather + switchboard for one user message that is already in the thread.
 * Uses latest `getContext()` so later user lines are in the prompt; `replyToUserMessageId`
 * targets routing / "User just said" to this turn.
 *
 * Primary routing avatars are **recomputed from context** (catalog + slot count + selection)
 * so we never use a stale empty roster from a ref that has not caught up to React state.
 */
export async function processUserTurn(
  getContext: () => SituationContext,
  job: UserTurnJob,
  selectedAvatarIds: string[],
  onProgress?: (situationContext: SituationContext) => void,
  turnUi?: ProcessUserTurnUiHooks
): Promise<void> {
  const ctx = getContext();
  const catalog = getFullAvatarCatalog(ctx);
  const routableCatalog = filterOutSystemAvatars(catalog);
  const slotCount = resolvePrimarySlotCount(ctx, routableCatalog.length);
  const coreForProactive = getSortedCoreAvatars(
    routableCatalog,
    ctx.avatarRosterPriorityScoreById,
    slotCount
  );
  const routingAvatars = routingAvatarsForSwitchboard(catalog, ctx, slotCount);
  const budgets = resolveContextEntryBudgets(ctx.contextEntryDepth);
  const effectiveFocus = mergeSituationFocus(job.focus, ctx.userFocus);
  const gatherStartedAt = performance.now();
  const data = await gatherDataFromCacheFirst(budgets, {
    includeEmail: Boolean(effectiveFocus.email?.id),
    includeContacts: Boolean(effectiveFocus.contact?.id),
  });
  appendSessionLog("chat", "platform_gather_ms", {
    level: "info",
    detail: `${Math.round(performance.now() - gatherStartedAt)}ms email=${data.email.length} cal=${data.calendar.length} contacts=${data.contacts.length}`,
  });
  const ctxAfterProactive = mergeProactiveEvaluation(
    data,
    ctx,
    coreForProactive,
    effectiveFocus
  );
  const mergedReleasedClusterIds = mergeReleasedClusterIds(
    job.content,
    ctxAfterProactive.pendingNotifications ?? [],
    job.releasedClusterIds
  );
  /**
   * System avatars are excluded from default switchboard scoring
   * but *may* appear in `forcedResponderIds` when the user explicitly
   * selected them from the sidebar or routed a turn via primaryAvatarId.
   * Only a fully-system-avatar force list triggers a log (so we notice if
   * something routes a system avatar unexpectedly); mixed lists pass through.
   */
  const rawForced = job.primaryAvatarId
    ? [job.primaryAvatarId]
    : selectedAvatarIds.length > 0
      ? selectedAvatarIds
      : undefined;
  if (
    rawForced &&
    rawForced.length > 0 &&
    rawForced.every((id) => isSystemAvatarId(id))
  ) {
    appendSessionLog("chat", "platform_forced_explicit", {
      level: "info",
      detail: `explicit system-only forced responders: ${rawForced.join(",")}`,
    });
  }
  const forcedResponderIds =
    rawForced && rawForced.length > 0 ? rawForced : undefined;
  const focusStrings = focusToRelevanceStrings(effectiveFocus);
  const pre = runUserTurnPreprocessor({
    userMessageContent: job.content,
    focus: effectiveFocus,
    entryCaps: {
      maxEmails: budgets.emailTopK,
      maxCalendar: budgets.calendarTopK,
      maxContacts: budgets.contactsTopK,
    },
  });
  const projectDetailLines = projectMetadataContextLines(
    effectiveFocus,
    getWorldMetadata().projects,
    {
      conversationThread: ctx.conversationThread,
      activeTask: ctx.activeTask,
      threadTailSize: pre.emailThreadTail,
    },
    budgets.projectExtraTopK
  );
  const wos = ctx.useWellOfSoulsInChat && ctx.wellOfSoulsRules?.trim();
  const wosLines = wos
    ? [`Well of Souls (personality rules draft):\n${ctx.wellOfSoulsRules!.trim()}`]
    : [];
  const userProfileLines = userProfileToRelevanceLines(
    getWorldMetadata().userProfile
  );
  const worldMetaDoc = getWorldMetadata();
  const worldMetadataCorpus = buildWorldMetadataScoringCorpus(
    worldMetaDoc,
    effectiveFocus
  );
  const focusEmailRow = effectiveFocus.email?.id
    ? data.email.find((e) => e.id === effectiveFocus.email!.id)
    : undefined;
  const focusCalendarRow = effectiveFocus.calendar?.id
    ? data.calendar.find((c) => c.id === effectiveFocus.calendar!.id)
    : undefined;
  const focusedEmailId = effectiveFocus.email?.id;
  let focusedEmailFullBody: string | undefined;
  let focusedEmailThreadId: string | undefined;
  if (focusedEmailId) {
    const fb = await fetchGmailMessageBody(focusedEmailId);
    focusedEmailFullBody = fb.body?.trim();
    focusedEmailThreadId = focusEmailRow?.threadId ?? fb.threadId;
  }

  let emailFocusArtifacts: EmailFocusArtifacts | undefined;
  let emailFocusPrepResult: EmailFocusPrepResult | undefined;
  if (focusedEmailId) {
    const threadId = focusedEmailThreadId;
    const openUrl = threadId ? gmailThreadWebUrl(threadId) : undefined;
    if (focusedEmailFullBody) {
      emailFocusPrepResult = await runEmailFocusPrep({
        messageId: focusedEmailId,
        threadId,
        from: focusEmailRow?.from ?? "",
        subject: effectiveFocus.email?.title ?? focusEmailRow?.subject ?? "",
        body: focusedEmailFullBody,
        userMessage: job.content.trim(),
      });
      emailFocusArtifacts = {
        messageId: focusedEmailId,
        threadId,
        cacheHit: emailFocusPrepResult.cacheHit,
        relevance: emailFocusPrepResult.relevance,
        openUrl,
      };
    } else {
      emailFocusArtifacts = {
        messageId: focusedEmailId,
        threadId,
        cacheHit: false,
        relevance: "uncertain",
        openUrl,
      };
    }
  }
  const focusEmailBodyExcerpt = focusedEmailFullBody?.slice(
    0,
    FOCUS_EMAIL_BODY_EXCERPT_MAX
  );
  const focusCorpusAppendix = buildFocusCorpusAppendix({
    focus: effectiveFocus,
    focusEmailRow,
    focusEmailBodyExcerpt,
    focusCalendarRow,
  });
  const focusSoft = buildFocusSoftSignals({
    focus: effectiveFocus,
    focusEmailRow,
    focusCalendarRow,
  });
  const scoringCorpusBase = {
    focusCorpusAppendix: focusCorpusAppendix.trim() || undefined,
    worldMetadataCorpus: worldMetadataCorpus.trim() || undefined,
    focusSoft,
  };
  const emailCtx = {
    focus: effectiveFocus,
    conversationThread: ctx.conversationThread,
    activeTask: ctx.activeTask,
    threadTailSize: pre.emailThreadTail,
    ...scoringCorpusBase,
  };
  const { emailLines, ranked: rankedEmails, diagnostics: emailRankingDiagnostics } =
    rankEmailsLinesAndDiagnostics(data.email, emailCtx, pre.maxEmails);
  const turnEmailFetchAllowlist = [
    ...new Set([
      ...rankedEmails.map((r) => r.email.id),
      ...data.email.map((e) => e.id).filter(Boolean),
    ]),
  ];
  let emailBodyLines: string[] = [];
  if (focusedEmailId && !turnEmailFetchAllowlist.includes(focusedEmailId)) {
    turnEmailFetchAllowlist.push(focusedEmailId);
  }
  if (focusedEmailId) {
    if (focusedEmailFullBody && emailFocusPrepResult) {
      emailBodyLines.push(
        ...buildEmailFocusContextLines(
          focusedEmailId,
          emailFocusPrepResult,
          focusedEmailFullBody
        )
      );
    } else {
      const hit = data.email.find((e) => e.id === focusedEmailId);
      const focusSnip = effectiveFocus.email?.snippet?.trim();
      const snip = hit?.snippet?.trim() || focusSnip;
      if (snip) {
        emailBodyLines.push(
          `Email body [${focusedEmailId}]:\n${snip}\n\n(Inbox snippet only — full MIME body was not loaded.)`
        );
      }
    }
  }
  const prefetchIds = selectStrongMatchBodyPrefetchIds(
    rankedEmails,
    focusedEmailId
  );
  const prefetchBodies = await Promise.all(
    prefetchIds.map((id) => fetchGmailMessageBody(id).then((r) => r.body))
  );
  for (let i = 0; i < prefetchIds.length; i++) {
    const id = prefetchIds[i]!;
    const body = prefetchBodies[i];
    if (body?.trim()) {
      emailBodyLines.push(`Email body [${id}]:\n${body}`);
    }
  }

  const calendarLines = scoreAndFormatCalendarEvents(
    data.calendar,
    {
      focus: effectiveFocus,
      conversationThread: ctx.conversationThread,
      activeTask: ctx.activeTask,
      threadTailSize: pre.calendarThreadTail,
      ...scoringCorpusBase,
    },
    pre.maxCalendar
  );
  const contactCtx = {
    focus: effectiveFocus,
    conversationThread: ctx.conversationThread,
    activeTask: ctx.activeTask,
    contactOverlayById: getContactOverlayById(),
    threadTailSize: pre.contactThreadTail,
    ...scoringCorpusBase,
  };
  const contactLines = scoreAndFormatContacts(
    data.contacts,
    contactCtx,
    pre.maxContacts
  );
  const socialSoloHint = shouldInjectSocialSoloHint(
    data.contacts,
    contactCtx,
    pre.maxContacts
  )
    ? [SOCIAL_SOLO_HEURISTIC_LINE]
    : [];
  const platformProjectLines = platformFocusedProjectBlock(effectiveFocus);
  const relevantData = [
    ...wosLines,
    ...userProfileLines,
    ...focusStrings,
    ...projectDetailLines,
    ...platformProjectLines,
    ...emailLines,
    ...emailBodyLines,
    ...calendarLines,
    ...contactLines,
    ...socialSoloHint,
    ...dataToRelevanceStringsWithoutEmail(data),
  ];

  let working: SituationContext = {
    ...ctxAfterProactive,
    relevantData,
    replyToUserMessageId: job.userMsgId,
    pendingReleaseClusterIds:
      mergedReleasedClusterIds.length > 0
        ? mergedReleasedClusterIds
        : undefined,
    turnEmailFetchAllowlist,
    switchboardRoutingMode: "single_wave",
    /** Omit to always call Ollama when ready. Set to e.g. `1` to skip LLM when `getRoutingScoreForAvatar` is below that. */
    preflightOllamaMinScore: undefined,
    lastEmailRankingDiagnostics: emailRankingDiagnostics,
  };

  if (emailFocusArtifacts) {
    working = patchUserMessageEmailFocusArtifacts(
      working,
      job.userMsgId,
      emailFocusArtifacts
    );
  }

  working = {
    ...working,
    executorAvatarIdForTurn: resolveExecutorAvatarId(working, forcedResponderIds),
  };

  let updatedContext = working;

  const switchboardAvatars = switchboardAvatarsIncludingForced(
    routingAvatars,
    catalog,
    forcedResponderIds
  );

  const { responses, trace } = await distributeAndRespond(
    working,
    switchboardAvatars,
    forcedResponderIds,
    3,
    {
      routingMode: "single_wave",
      onAvatarComplete: ({ avatarId, result }) => {
        if (result.suppressUserMessage) {
          appendSessionLog("chat", "avatar_reply_suppressed", {
            level: "info",
            detail: `${avatarId} hidden (no-comment or preflight skip)`,
          });
        }
        const avatarMsg = conversationMessageFromAvatarResult(avatarId, result);
        if (avatarMsg) {
          updatedContext = appendToConversation(updatedContext, avatarMsg);
        }
        onProgress?.(stripEphemeralFields(updatedContext));
      },
      onTraceProgress: turnUi?.onTraceProgress
        ? ({ trace: t }) =>
            turnUi.onTraceProgress!({
              trace: t,
              userMessageId: job.userMsgId,
            })
        : undefined,
      onWaveChatComplete: turnUi?.onWaveChatComplete
        ? ({ depth }) =>
            turnUi.onWaveChatComplete!({
              depth,
              userMessageId: job.userMsgId,
            })
        : undefined,
      onWorldviewActivity: turnUi?.onWorldviewActivity
        ? ({ avatarId, userMessageId, toolNames, sourceEmailId, actions }) =>
            turnUi.onWorldviewActivity!({
              avatarId,
              userMessageId,
              toolNames,
              sourceEmailId,
              actions,
            })
        : undefined,
      onToolResolutionError: turnUi?.onToolResolutionError
        ? (args) => turnUi.onToolResolutionError!(args)
        : undefined,
      onWorldviewParseDiagnostic: turnUi?.onWorldviewParseDiagnostic
        ? ({
            avatarId,
            userMessageId,
            hints,
            reason,
            sourceEmailId,
          }) =>
            turnUi.onWorldviewParseDiagnostic!({
              avatarId,
              userMessageId,
              hints,
              reason,
              sourceEmailId,
            })
        : undefined,
      onSystemCommandStatus: turnUi?.onSystemCommandStatus
        ? (args) => turnUi.onSystemCommandStatus!(args)
        : undefined,
    }
  );

  appendTurn(
    buildCompactTurnRecord(
      job.userMsgId,
      job.content.trim(),
      effectiveFocus,
      forcedResponderIds,
      trace,
      responses,
      emailFocusArtifacts
    )
  );

  if (mergedReleasedClusterIds.length > 0) {
    updatedContext = {
      ...updatedContext,
      pendingNotifications: removePendingByClusterIds(
        updatedContext.pendingNotifications ?? [],
        mergedReleasedClusterIds
      ),
    };
  }

  const suggestedActive = suggestActiveTaskFromUserMessage(
    job.content.trim(),
    updatedContext.activeTask
  );
  if (suggestedActive) {
    updatedContext = { ...updatedContext, activeTask: suggestedActive };
  }

  persistContext(stripEphemeralFields(updatedContext));
  onProgress?.(stripEphemeralFields(updatedContext));
}
