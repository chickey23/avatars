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

export interface SwitchboardResult {
  responderIds: string[];
  relevantData: string[];
}

export interface EvaluateRelevanceMetaResult extends SwitchboardResult {
  selection: SwitchboardSelection;
}

/**
 * Evaluate context and data sources to select which Avatars should respond.
 * Uses tag affinity, personality relevance, and opinion matrix for cascade.
 */
export function evaluateRelevanceWithMeta(
  ctx: SituationContext,
  avatars: Avatar[],
  dataFromSources: string[] = []
): EvaluateRelevanceMetaResult {
  const lastMsg = getRoutingLastMessage(ctx);
  if (!lastMsg) {
    return { responderIds: [], relevantData: [...dataFromSources], selection: "default_primary" };
  }

  const relevantData = [...dataFromSources];
  const responderIds: string[] = [];

  if (lastMsg.role === "user") {
    const content = lastMsg.content.toLowerCase();
    let selection: SwitchboardSelection = "default_primary";
    for (const avatar of avatars) {
      const tagOverlap = avatar.tags.filter((t) =>
        content.includes(t.toLowerCase())
      ).length;
      const interestOverlap = avatar.interests.filter((i) =>
        content.includes(i.toLowerCase())
      ).length;
      if (tagOverlap > 0 || interestOverlap > 0) {
        responderIds.push(avatar.id);
        selection = "tag_interest_match";
        break;
      }
    }
    if (responderIds.length === 0 && avatars.length > 0) {
      responderIds.push(avatars[0].id);
      selection = "default_primary";
    }
    return { responderIds, relevantData, selection };
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

export function evaluateRelevance(
  ctx: SituationContext,
  avatars: Avatar[],
  dataFromSources: string[] = []
): SwitchboardResult {
  const r = evaluateRelevanceWithMeta(ctx, avatars, dataFromSources);
  return { responderIds: r.responderIds, relevantData: r.relevantData };
}

export type DistributeAndRespondOptions = {
  /** Called after each `runAvatarAgent` completes (incremental UI). */
  onAvatarComplete?: (args: {
    avatarId: string;
    result: AvatarAgentResult;
  }) => void;
};

/**
 * Invoke Avatar Agent(s) with full context and return responses.
 * Cascade: each response is appended to context; Switchboard re-evaluates for next responders.
 */
export async function distributeAndRespond(
  ctx: SituationContext,
  avatars: Avatar[],
  selectedAvatarId?: string,
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

  if (selectedAvatarId) {
    toRespond = [selectedAvatarId];
    selection = "forced_primary";
  } else {
    const m = evaluateRelevanceWithMeta(currentCtx, avatars);
    toRespond = m.responderIds;
    selection = m.selection;
  }

  while (toRespond.length > 0 && depth < maxCascadeDepth) {
    trace.push({
      depth,
      responderIds: [...toRespond],
      selection,
    });

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

    const next = evaluateRelevanceWithMeta(currentCtx, avatars);
    toRespond = next.responderIds.filter(
      (id) => !responses.some((r) => r.avatarId === id)
    );
    selection = next.selection;
    depth++;
  }

  return { responses, trace };
}
