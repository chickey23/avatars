/**
 * Switchboard Agent - gathers data, determines relevance, distributes to Avatars.
 * Evaluates Situation Context and selects which Avatar(s) should respond.
 * Supports cascade: Avatar responses feed back; opinion matrix influences next responders.
 */

import type {
  SituationContext,
  Avatar,
  AvatarAgentResult,
  SwitchboardSelection,
  SwitchboardTraceStep,
  OllamaPromptDebug,
  ReplySource,
  RulesSkipReason,
  WorldviewActivityAction,
  WorldviewToolResolutionFailure,
} from "../types";
import type { WavesSystemCommandStatus } from "./switchboardWavesQueue";

/** Lets React (and the Chat Visualizer) commit each system-command state before the next, so Q→V→+ can paint. */
function delayForVisualizerFrame(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
import { getRoutingLastMessage } from "./situationContext";
import { runAvatarAgent } from "./avatarAgents";
import { shouldReact } from "./opinionMatrix";
import { PROACTIVE_MAX_AVATARS_PER_CLUSTER } from "./pendingNotifications";
import { loadTasks, type LongTermTask } from "./longTermTasks";
import { embedWithOllama } from "./ollama";
import {
  buildAvatarRoutingText,
  cosineSimilarity,
} from "./avatarRoutingProfile";
import {
  getAddressTier,
} from "./routingDirectAddress";
import { buildActiveTasksByAvatar, getRoutingScoreForAvatar } from "./routingScore";
import {
  getSemanticBiasFromRosterScore,
  getRosterScore,
  mergePopInIntoResponderIds,
} from "./avatarRoster";
import { appendSessionLog } from "./sessionLog";
import { filterOutSystemAvatars } from "./platform";

export {
  scoreAvatarForUserMessageContent,
  scoreTaskMatchForAvatar,
  getRoutingScoreForAvatar,
} from "./routingScore";

export interface SwitchboardResult {
  responderIds: string[];
  relevantData: string[];
}

export interface EvaluateRelevanceMetaResult extends SwitchboardResult {
  selection: SwitchboardSelection;
}

/**
 * Picks up to K avatars with positive tag/interest (and optional task) match; else first avatar.
 * @param tasksOverride - For tests; when omitted, loads from `loadTasks()`.
 */
export function pickRespondersForUserMessage(
  content: string,
  avatars: Avatar[],
  maxAvatars: number = PROACTIVE_MAX_AVATARS_PER_CLUSTER,
  tasksOverride?: LongTermTask[],
  rosterScores?: Record<string, number>
): { responderIds: string[]; selection: SwitchboardSelection } {
  const contentLower = content.toLowerCase();
  const routable = filterOutSystemAvatars(avatars);
  const scored = routable.map((a) => {
    const tier = getAddressTier(a, contentLower);
    return {
      id: a.id,
      score: getRoutingScoreForAvatar(a, content, tasksOverride, rosterScores),
      tier,
    };
  });
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.tier - a.tier;
  });
  const positive = scored.filter((s) => s.score > 0).slice(0, maxAvatars);
  if (positive.length > 0) {
    return {
      responderIds: positive.map((s) => s.id),
      selection: "tag_interest_match",
    };
  }
  if (routable.length > 0) {
    return {
      responderIds: [routable[0].id],
      selection: "default_primary",
    };
  }
  return { responderIds: [], selection: "default_primary" };
}

/**
 * Ollama embedding similarity routing; returns null to use literal tag/interest/task matching.
 */
async function trySemanticUserRouting(
  content: string,
  avatars: Avatar[],
  tasksByAvatar: Map<string, LongTermTask[]>,
  maxAvatars: number,
  rosterScores?: Record<string, number>
): Promise<{ responderIds: string[]; selection: "semantic_match" } | null> {
  const userEmb = await embedWithOllama(content);
  if (!userEmb.ok) return null;

  const contentLower = content.toLowerCase();
  const scored: { id: string; sim: number; tier: 0 | 1 | 2 }[] = [];
  const routable = filterOutSystemAvatars(avatars);
  for (const a of routable) {
    const text = buildAvatarRoutingText(a, tasksByAvatar);
    const emb = await embedWithOllama(text);
    if (!emb.ok) return null;
    const sim = cosineSimilarity(userEmb.embedding, emb.embedding);
    const tier = getAddressTier(a, contentLower);
    scored.push({
      id: a.id,
      sim: sim + getSemanticBiasFromRosterScore(getRosterScore(rosterScores, a.id)),
      tier,
    });
  }
  scored.sort((x, y) => {
    if (y.tier !== x.tier) return y.tier - x.tier;
    return y.sim - x.sim;
  });
  if (scored.length === 0) return null;
  const top = scored[0];
  /** Address tier can win even when embeddings are orthogonal (sim 0). */
  if (top.tier === 0 && top.sim <= 0) return null;

  return {
    responderIds: scored.slice(0, maxAvatars).map((s) => s.id),
    selection: "semantic_match",
  };
}

/**
 * Evaluate context and data sources to select which Avatars should respond.
 * Uses tag affinity, personality relevance, and opinion matrix for cascade.
 */
export async function evaluateRelevanceWithMeta(
  ctx: SituationContext,
  avatars: Avatar[],
  dataFromSources: string[] = []
): Promise<EvaluateRelevanceMetaResult> {
  const lastMsg = getRoutingLastMessage(ctx);
  if (!lastMsg) {
    return { responderIds: [], relevantData: [...dataFromSources], selection: "default_primary" };
  }

  const relevantData = [...dataFromSources];
  const responderIds: string[] = [];

  if (lastMsg.role === "user") {
    const tasks = loadTasks();
    const tasksByAvatar = buildActiveTasksByAvatar(tasks);
    const rosterScores = ctx.avatarRosterPriorityScoreById;
    const semantic = await trySemanticUserRouting(
      lastMsg.content,
      avatars,
      tasksByAvatar,
      PROACTIVE_MAX_AVATARS_PER_CLUSTER,
      rosterScores
    );
    if (semantic) {
      return {
        responderIds: mergePopInIntoResponderIds(semantic.responderIds, ctx),
        relevantData,
        selection: semantic.selection,
      };
    }
    const picked = pickRespondersForUserMessage(
      lastMsg.content,
      avatars,
      PROACTIVE_MAX_AVATARS_PER_CLUSTER,
      tasks,
      rosterScores
    );
    return {
      responderIds: mergePopInIntoResponderIds(picked.responderIds, ctx),
      relevantData,
      selection: picked.selection,
    };
  }

  if (lastMsg.role === "avatar" && lastMsg.avatarId) {
    for (const avatar of avatars) {
      if (avatar.id === lastMsg.avatarId) continue;
      if (shouldReact(avatar.id, lastMsg.avatarId, avatar.opinions)) {
        responderIds.push(avatar.id);
        break;
      }
    }
    return { responderIds, relevantData, selection: "cascade" };
  }

  return { responderIds, relevantData, selection: "default_primary" };
}

export async function evaluateRelevance(
  ctx: SituationContext,
  avatars: Avatar[],
  dataFromSources: string[] = []
): Promise<SwitchboardResult> {
  const r = await evaluateRelevanceWithMeta(ctx, avatars, dataFromSources);
  return { responderIds: r.responderIds, relevantData: r.relevantData };
}

export type DistributeAndRespondOptions = {
  /** Called after each `runAvatarAgent` completes (incremental UI). */
  onAvatarComplete?: (args: {
    avatarId: string;
    result: AvatarAgentResult;
  }) => void;
  /** Called after each routing wave is scheduled (a trace step is appended). */
  onTraceProgress?: (args: { trace: SwitchboardTraceStep[] }) => void;
  /**
   * After each wave’s responders have run and their messages are appended to context
   * (before the next routing evaluation). Use to align UI with visible chat for that wave.
   */
  onWaveChatComplete?: (args: { depth: number }) => void;
  /** After an avatar reply applied worldview JSON tools (Ollama path). */
  onWorldviewActivity?: (args: {
    avatarId: string;
    userMessageId: string;
    toolNames: string[];
    /** Short per-tool summaries for the waves queue (non-secret). */
    actions?: WorldviewActivityAction[];
    sourceEmailId?: string;
  }) => void;
  /** Lexical malformed or tool execution failure (one callback per failure). */
  onToolResolutionError?: (args: {
    avatarId: string;
    userMessageId: string;
    /** Short summary for legacy / a11y (e.g. `tool: code`). */
    message: string;
    detail?: string;
    toolId?: string;
    errorCode?: string;
    /** Truncated non-secret args preview for Waves. */
    argsPreview?: string;
    sourceEmailId?: string;
  }) => void;
  /** Model output looked like tools but did not parse as avatars_tools_v1. */
  onWorldviewParseDiagnostic?: (args: {
    avatarId: string;
    userMessageId: string;
    hints: string[];
    reason: string | null;
    sourceEmailId?: string;
  }) => void;
  /** Deferred system-command lifecycle emitted for visualizer/debug UX. */
  onSystemCommandStatus?: (args: {
    avatarId: string;
    userMessageId: string;
    status: WavesSystemCommandStatus;
    detail?: string;
    sourceEmailId?: string;
  }) => void;
  /** `single_wave` = one wave only (no cascade re-routing). Default: `cascade`. */
  routingMode?: "cascade" | "single_wave";
  /** Fired in `single_wave` mode with ids that would have been scheduled next (not run). */
  onSingleWaveCascadePreview?: (args: { wouldRespondIds: string[] }) => void;
};

function filterKnownAvatarIds(ids: string[], avatars: Avatar[]): string[] {
  const known = new Set(avatars.map((a) => a.id));
  return ids.filter((id) => known.has(id));
}

/** Run the routing executor first when they are in this wave’s responder list. */
function orderRespondersWithExecutorFirst(
  ids: string[],
  executorId: string | undefined
): string[] {
  const ex = executorId?.trim();
  if (!ex || ids.length <= 1) return ids;
  const i = ids.indexOf(ex);
  if (i <= 0) return ids;
  const copy = [...ids];
  copy.splice(i, 1);
  copy.unshift(ex);
  return copy;
}

/**
 * Invoke Avatar Agent(s) with full context and return responses.
 * Cascade: each response is appended to context; Switchboard re-evaluates for next responders.
 * @param forcedResponderIds - If non-empty after filtering, wave 1 uses exactly these avatars; else automatic routing.
 */
export async function distributeAndRespond(
  ctx: SituationContext,
  avatars: Avatar[],
  forcedResponderIds?: string[],
  maxCascadeDepth: number = 3,
  options?: DistributeAndRespondOptions
): Promise<{
  responses: Array<{
    avatarId: string;
    content: string;
    replySource: ReplySource;
    promptDebug?: OllamaPromptDebug;
    replyError?: string;
    rulesSkipReason?: RulesSkipReason;
    suppressUserMessage?: boolean;
    preflightSkip?: { score: number; threshold: number };
    worldviewParseDiagnosis?: AvatarAgentResult["worldviewParseDiagnosis"];
    toolResolutionFailures?: WorldviewToolResolutionFailure[];
    postTurnUi?: AvatarAgentResult["postTurnUi"];
    postTurnUiReason?: string;
  }>;
  trace: SwitchboardTraceStep[];
}> {
  const responses: Array<{
    avatarId: string;
    content: string;
    replySource: ReplySource;
    promptDebug?: OllamaPromptDebug;
    replyError?: string;
    rulesSkipReason?: RulesSkipReason;
    suppressUserMessage?: boolean;
    preflightSkip?: { score: number; threshold: number };
    worldviewParseDiagnosis?: AvatarAgentResult["worldviewParseDiagnosis"];
    toolResolutionFailures?: WorldviewToolResolutionFailure[];
    postTurnUi?: AvatarAgentResult["postTurnUi"];
    postTurnUiReason?: string;
  }> = [];
  const trace: SwitchboardTraceStep[] = [];
  let currentCtx = { ...ctx };
  let depth = 0;

  let toRespond: string[];
  let selection: SwitchboardSelection;

  const forced = filterKnownAvatarIds(forcedResponderIds ?? [], avatars);
  if (forced.length > 0) {
    toRespond = mergePopInIntoResponderIds(forced, currentCtx);
    selection = forced.length === 1 ? "forced_primary" : "forced_multi";
  } else {
    const m = await evaluateRelevanceWithMeta(currentCtx, avatars);
    toRespond = m.responderIds;
    selection = m.selection;
  }
  toRespond = orderRespondersWithExecutorFirst(
    toRespond,
    currentCtx.executorAvatarIdForTurn
  );

  while (toRespond.length > 0 && depth < maxCascadeDepth) {
    trace.push({
      depth,
      responderIds: [...toRespond],
      selection,
    });
    options?.onTraceProgress?.({ trace: [...trace] });

    for (const avatarId of toRespond) {
      const avatar = avatars.find((a) => a.id === avatarId);
      if (!avatar) continue;

      const result = await runAvatarAgent(avatar, currentCtx);
      const userMessageId = currentCtx.replyToUserMessageId ?? "";
      const sourceEmailId = currentCtx.userFocus?.email?.id;
      const parseHints = result.worldviewParseDiagnosis?.hints ?? [];
      const parsedIntents =
        result.promptDebug?.worldviewParsedToolIntentNames?.length ?? 0;
      const executedIntents =
        result.promptDebug?.worldviewExecutedToolNames?.length ?? 0;
      const resErrCount =
        result.toolResolutionFailures?.length ??
        result.toolResolutionErrors?.length ??
        0;
      if (parseHints.length > 0) {
        options?.onSystemCommandStatus?.({
          avatarId,
          userMessageId,
          status: "failed",
          detail:
            `parse failed: ${parseHints.slice(0, 2).join(" | ")}`.slice(
              0,
              240
            ),
          sourceEmailId,
        });
      } else if (parsedIntents === 0) {
        options?.onSystemCommandStatus?.({
          avatarId,
          userMessageId,
          status: "no_tools",
          detail: "no system commands returned",
          sourceEmailId,
        });
      } else {
        const onCmd = options?.onSystemCommandStatus;
        onCmd?.({
          avatarId,
          userMessageId,
          status: "queued",
          detail: `${parsedIntents} command(s) returned by model`,
          sourceEmailId,
        });
        if (onCmd) {
          await delayForVisualizerFrame();
        }
        onCmd?.({
          avatarId,
          userMessageId,
          status: "validated",
          detail: "tool envelope parsed",
          sourceEmailId,
        });
        if (executedIntents > 0) {
          if (onCmd) {
            await delayForVisualizerFrame();
          }
          onCmd?.({
            avatarId,
            userMessageId,
            status: "applied",
            detail: `${executedIntents} command(s) applied`,
            sourceEmailId,
          });
        }
        if (resErrCount > 0) {
          if (onCmd) {
            await delayForVisualizerFrame();
          }
          onCmd?.({
            avatarId,
            userMessageId,
            status: "failed",
            detail: `${resErrCount} command error(s): ${result.toolResolutionErrors?.[0] ?? "failed"}`.slice(
              0,
              240
            ),
            sourceEmailId,
          });
        } else if (executedIntents === 0) {
          if (onCmd) {
            await delayForVisualizerFrame();
          }
          onCmd?.({
            avatarId,
            userMessageId,
            status: "failed",
            detail: "commands returned but none applied",
            sourceEmailId,
          });
        }
      }
      const act = result.worldviewActivity;
      const toolNames =
        act?.names && act.names.length > 0
          ? act.names
          : (result.worldviewToolSummary?.names ?? []);
      if (toolNames.length > 0) {
        options?.onWorldviewActivity?.({
          avatarId,
          userMessageId,
          toolNames,
          actions: act?.actions,
          sourceEmailId,
        });
      }
      const structuredFails = result.toolResolutionFailures;
      if (structuredFails?.length) {
        for (const f of structuredFails) {
          const msg = `${f.tool}: ${f.error}`.slice(0, 200);
          options?.onToolResolutionError?.({
            avatarId,
            userMessageId,
            message: msg,
            toolId: f.tool,
            errorCode: f.error,
            argsPreview: f.argsPreview,
            sourceEmailId,
          });
        }
      } else {
        const resErrs = result.toolResolutionErrors;
        if (resErrs?.length) {
          for (const msg of resErrs) {
            options?.onToolResolutionError?.({
              avatarId,
              userMessageId,
              message: msg.slice(0, 160),
              detail: msg.length > 160 ? msg.slice(160, 480) : undefined,
              sourceEmailId,
            });
          }
        }
      }
      if (result.worldviewParseDiagnosis?.hints.length) {
        options?.onWorldviewParseDiagnostic?.({
          avatarId,
          userMessageId,
          hints: result.worldviewParseDiagnosis.hints,
          reason: result.worldviewParseDiagnosis.reason,
          sourceEmailId,
        });
      }
      options?.onAvatarComplete?.({ avatarId, result });
      responses.push({
        avatarId,
        content: result.content,
        replySource: result.replySource,
        promptDebug: result.promptDebug,
        replyError: result.replyError,
        rulesSkipReason: result.rulesSkipReason,
        suppressUserMessage: result.suppressUserMessage,
        preflightSkip: result.preflightSkip,
        worldviewParseDiagnosis: result.worldviewParseDiagnosis,
        toolResolutionFailures: result.toolResolutionFailures,
        postTurnUi: result.postTurnUi,
        postTurnUiReason: result.postTurnUiReason,
      });

      if (!result.suppressUserMessage) {
        const msg = {
          id: crypto.randomUUID(),
          role: "avatar" as const,
          avatarId,
          content: result.content,
          timestamp: Date.now(),
        };
        currentCtx = {
          ...currentCtx,
          conversationThread: [...currentCtx.conversationThread, msg],
          recentEvents: [
            ...currentCtx.recentEvents.slice(-9),
            `msg:avatar:${avatarId}:${Date.now()}`,
          ],
        };
      }
    }

    options?.onWaveChatComplete?.({ depth });

    if (options?.routingMode === "single_wave") {
      const nextPreview = await evaluateRelevanceWithMeta(currentCtx, avatars);
      const wouldRespondIds = nextPreview.responderIds.filter(
        (id) => !responses.some((r) => r.avatarId === id)
      );
      options?.onSingleWaveCascadePreview?.({ wouldRespondIds });
      appendSessionLog("chat", "switchboard_single_wave", {
        level: "info",
        detail: `one_wave_done would_have_cascaded=${wouldRespondIds.join("+") || "none"}`,
      });
      break;
    }

    const next = await evaluateRelevanceWithMeta(currentCtx, avatars);
    toRespond = orderRespondersWithExecutorFirst(
      next.responderIds.filter((id) => !responses.some((r) => r.avatarId === id)),
      currentCtx.executorAvatarIdForTurn
    );
    selection = next.selection;
    depth++;
  }

  return { responses, trace };
}
