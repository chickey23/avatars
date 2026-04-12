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
} from "../types";
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
  addressTierBonus,
} from "./routingDirectAddress";

export interface SwitchboardResult {
  responderIds: string[];
  relevantData: string[];
}

export interface EvaluateRelevanceMetaResult extends SwitchboardResult {
  selection: SwitchboardSelection;
}

const MIN_TASK_TITLE_MATCH_LEN = 4;
const TASK_MATCH_BONUS = 5;
const MAX_TASK_MATCH_SCORE_PER_AVATAR = 18;
const MAX_TAG_INTEREST_SCORE = 40;
/** Combined tag/interest + task match ceiling (40 + 18). */
const MAX_COMBINED_MATCH_SCORE = 58;

function sumTagInterestScoreUncapped(avatar: Avatar, contentLower: string): number {
  let n = 0;
  for (const t of avatar.tags) {
    if (contentLower.includes(t.toLowerCase())) n += 6;
  }
  for (const i of avatar.interests) {
    if (contentLower.includes(i.toLowerCase())) n += 5;
  }
  return n;
}

/** Tag/interest overlap score vs user message (aligned with proactive affinity weights). */
export function scoreAvatarForUserMessageContent(
  avatar: Avatar,
  contentLower: string
): number {
  return Math.min(MAX_TAG_INTEREST_SCORE, sumTagInterestScoreUncapped(avatar, contentLower));
}

function buildActiveTasksByAvatar(tasks: LongTermTask[]): Map<string, LongTermTask[]> {
  const map = new Map<string, LongTermTask[]>();
  for (const task of tasks) {
    if (task.status !== "active") continue;
    const arr = map.get(task.avatarId) ?? [];
    arr.push(task);
    map.set(task.avatarId, arr);
  }
  return map;
}

/**
 * Bounded bonus when user text overlaps active long-term task title/description.
 */
export function scoreTaskMatchForAvatar(
  avatarId: string,
  contentLower: string,
  tasksByAvatar: Map<string, LongTermTask[]>
): number {
  const tasks = tasksByAvatar.get(avatarId) ?? [];
  let total = 0;
  for (const task of tasks) {
    if (total >= MAX_TASK_MATCH_SCORE_PER_AVATAR) break;
    const title = task.title.trim();
    let matched = false;
    if (title.length >= MIN_TASK_TITLE_MATCH_LEN) {
      matched = contentLower.includes(title.toLowerCase());
    }
    if (!matched && task.description?.trim()) {
      const blob = task.description.trim().toLowerCase();
      if (blob.length >= 12 && contentLower.includes(blob)) {
        matched = true;
      } else {
        for (const word of blob.split(/[^a-z0-9]+/)) {
          if (word.length >= 5 && contentLower.includes(word)) {
            matched = true;
            break;
          }
        }
      }
    }
    if (matched) {
      total += TASK_MATCH_BONUS;
    }
  }
  return Math.min(MAX_TASK_MATCH_SCORE_PER_AVATAR, total);
}

function combinedMatchScoreForAvatar(
  avatar: Avatar,
  contentLower: string,
  tasksByAvatar: Map<string, LongTermTask[]>
): number {
  const ti = Math.min(MAX_TAG_INTEREST_SCORE, sumTagInterestScoreUncapped(avatar, contentLower));
  const taskPart = scoreTaskMatchForAvatar(avatar.id, contentLower, tasksByAvatar);
  return Math.min(MAX_COMBINED_MATCH_SCORE, ti + taskPart);
}

/**
 * Picks up to K avatars with positive tag/interest (and optional task) match; else first avatar.
 * @param tasksOverride - For tests; when omitted, loads from `loadTasks()`.
 */
export function pickRespondersForUserMessage(
  content: string,
  avatars: Avatar[],
  maxAvatars: number = PROACTIVE_MAX_AVATARS_PER_CLUSTER,
  tasksOverride?: LongTermTask[]
): { responderIds: string[]; selection: SwitchboardSelection } {
  const contentLower = content.toLowerCase();
  const tasks = tasksOverride ?? loadTasks();
  const tasksByAvatar = buildActiveTasksByAvatar(tasks);
  const scored = avatars.map((a) => {
    const base = combinedMatchScoreForAvatar(a, contentLower, tasksByAvatar);
    const tier = getAddressTier(a, contentLower);
    return {
      id: a.id,
      score: base + addressTierBonus(tier),
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
  if (avatars.length > 0) {
    return {
      responderIds: [avatars[0].id],
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
  maxAvatars: number
): Promise<{ responderIds: string[]; selection: "semantic_match" } | null> {
  const userEmb = await embedWithOllama(content);
  if (!userEmb.ok) return null;

  const contentLower = content.toLowerCase();
  const scored: { id: string; sim: number; tier: 0 | 1 | 2 }[] = [];
  for (const a of avatars) {
    const text = buildAvatarRoutingText(a, tasksByAvatar);
    const emb = await embedWithOllama(text);
    if (!emb.ok) return null;
    const sim = cosineSimilarity(userEmb.embedding, emb.embedding);
    const tier = getAddressTier(a, contentLower);
    scored.push({ id: a.id, sim, tier });
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
    const semantic = await trySemanticUserRouting(
      lastMsg.content,
      avatars,
      tasksByAvatar,
      PROACTIVE_MAX_AVATARS_PER_CLUSTER
    );
    if (semantic) {
      return {
        responderIds: semantic.responderIds,
        relevantData,
        selection: semantic.selection,
      };
    }
    const picked = pickRespondersForUserMessage(lastMsg.content, avatars);
    return {
      responderIds: picked.responderIds,
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
};

function filterKnownAvatarIds(ids: string[], avatars: Avatar[]): string[] {
  const known = new Set(avatars.map((a) => a.id));
  return ids.filter((id) => known.has(id));
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
  }> = [];
  const trace: SwitchboardTraceStep[] = [];
  let currentCtx = { ...ctx };
  let depth = 0;

  let toRespond: string[];
  let selection: SwitchboardSelection;

  const forced = filterKnownAvatarIds(forcedResponderIds ?? [], avatars);
  if (forced.length > 0) {
    toRespond = forced;
    selection = forced.length === 1 ? "forced_primary" : "forced_multi";
  } else {
    const m = await evaluateRelevanceWithMeta(currentCtx, avatars);
    toRespond = m.responderIds;
    selection = m.selection;
  }

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
      options?.onAvatarComplete?.({ avatarId, result });
      responses.push({
        avatarId,
        content: result.content,
        replySource: result.replySource,
        promptDebug: result.promptDebug,
        replyError: result.replyError,
        rulesSkipReason: result.rulesSkipReason,
      });

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

    const next = await evaluateRelevanceWithMeta(currentCtx, avatars);
    toRespond = next.responderIds.filter(
      (id) => !responses.some((r) => r.avatarId === id)
    );
    selection = next.selection;
    depth++;
  }

  return { responses, trace };
}
