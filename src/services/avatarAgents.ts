/**
 * Avatar Interface Agents - one per Primary Avatar.
 * Each receives full Situation Context and generates responses.
 */

import type {
  Avatar,
  AvatarAgentResult,
  OllamaPromptDebug,
  SituationContext,
} from "../types";
import { getRecentConversation } from "./situationContext";
import { getTasksForAvatar } from "./longTermTasks";
import { getOllamaPresence, generateWithOllama } from "./ollama";
import { appendSessionLog } from "./sessionLog";
import { getRuleBodiesForAvatar } from "./avatarRules";
import { formatPendingNotificationsForPrompt } from "./pendingNotifications";

/**
 * Run an Avatar's interface Agent with full context.
 * Uses Ollama when available; falls back to personality-based rules.
 */
export async function runAvatarAgent(
  avatar: Avatar,
  ctx: SituationContext
): Promise<AvatarAgentResult> {
  const recent = getRecentConversation(ctx, 24);
  const anchoredUser = ctx.replyToUserMessageId
    ? ctx.conversationThread.find(
        (m) => m.id === ctx.replyToUserMessageId && m.role === "user"
      )
    : undefined;
  const lastUser =
    anchoredUser ?? [...recent].reverse().find((m) => m.role === "user");
  const userContent = lastUser?.content ?? "";
  const tasks = getTasksForAvatar(avatar.id);
  const { text: rulesText, blockIds: ruleBlockIds } = getRuleBodiesForAvatar(avatar);

  const presence = await getOllamaPresence();
  if (presence === "ready") {
    const pendingForAvatar =
      ctx.pendingNotifications?.filter((p) => p.avatarId === avatar.id) ?? [];
    const pendingBlock = formatPendingNotificationsForPrompt(
      pendingForAvatar,
      ctx.pendingReleaseClusterIds
    );
    const fullPrompt = buildOllamaPrompt(
      avatar,
      userContent,
      recent,
      tasks,
      ctx.activeTask,
      ctx.relevantData,
      rulesText,
      pendingBlock
    );
    const debug: OllamaPromptDebug = {
      givenName: avatar.givenName,
      personality: avatar.personality,
      interests: [...avatar.interests],
      tasks: tasks.map((t) => ({ title: t.title })),
      activeTask: ctx.activeTask,
      relevantData: ctx.relevantData ? [...ctx.relevantData] : [],
      recentTranscript: recent.map((m) => `${m.role}: ${m.content}`).join("\n"),
      fullPrompt,
      ruleBlockIds,
      pendingNotificationsBlock: pendingBlock || undefined,
    };
    appendSessionLog(
      "chat",
      `Calling Ollama (${avatar.id})`,
      {
        level: "info",
        detail: `prompt ${fullPrompt.length} chars; relevantData lines ${ctx.relevantData?.length ?? 0}`,
      }
    );
    const gen = await generateWithOllama({ prompt: fullPrompt });
    if (gen.ok) {
      return {
        content: gen.text,
        replySource: "ollama",
        promptDebug: debug,
      };
    }
    appendSessionLog(
      "chat",
      `Avatar reply: fallback (Ollama failed after prompt built for ${avatar.id})`,
      { level: "warn", detail: gen.error }
    );
    return {
      content: generatePersonalityResponse(
        avatar,
        userContent,
        recent,
        tasks,
        shortFocusSummary(ctx.relevantData)
      ),
      replySource: "fallback",
      promptDebug: debug,
      replyError: gen.error,
    };
  }

  return {
    content: generatePersonalityResponse(
      avatar,
      userContent,
      recent,
      tasks,
      shortFocusSummary(ctx.relevantData)
    ),
    replySource: "rules",
    rulesSkipReason: presence === "no_models" ? "no_models" : "unavailable",
  };
}

function formatRelevantDataForPrompt(relevant?: string[]): string {
  if (!relevant?.length) return "";
  const shown = relevant.slice(0, 25);
  return `Relevant context (connector data; lines starting with "focus:" are the user's current Focus):\n${shown.join("\n")}`;
}

function shortFocusSummary(relevant?: string[]): string | undefined {
  const lines = relevant?.filter((s) => s.startsWith("focus:")) ?? [];
  if (!lines.length) return undefined;
  const parts: string[] = [];
  if (lines.some((l) => l.includes("focus: email"))) parts.push("a selected email");
  if (lines.some((l) => l.includes("focus: calendar"))) parts.push("a selected calendar event");
  if (lines.some((l) => l.includes("focus: contact"))) parts.push("a selected contact");
  return parts.join(", ");
}

function buildOllamaPrompt(
  avatar: Avatar,
  userInput: string,
  recent: { role: string; content: string }[],
  tasks: { title: string }[],
  activeTask: string | undefined,
  relevantData: string[] | undefined,
  rulesText: string,
  pendingBlock?: string
): string {
  const context = recent.map((m) => `${m.role}: ${m.content}`).join("\n");
  const taskStr = tasks.length > 0 ? tasks.map((t) => t.title).join(", ") : "none";
  const dataBlock = formatRelevantDataForPrompt(relevantData);
  const preamble = avatar.textBlocks?.preamble
    ? `${avatar.textBlocks.preamble}\n\n`
    : "";
  const rulesBlock = rulesText
    ? `\nGuidelines (library rules):\n${rulesText}\n`
    : "";
  const pend = pendingBlock ? `\n${pendingBlock}\n` : "";
  return `${preamble}You are ${avatar.givenName}. Personality: ${avatar.personality}. Interests: ${avatar.interests.join(", ")}.
Current assigned tasks: ${taskStr}. Active task: ${activeTask ?? "none"}.
${rulesBlock}${dataBlock ? `\n${dataBlock}\n` : ""}${pend}
Recent conversation:
${context}

User just said: "${userInput}"

Respond briefly as ${avatar.givenName}, staying in character:`;
}

function generatePersonalityResponse(
  avatar: Avatar,
  userInput: string,
  _recent: { role: string; content: string; avatarId?: string }[],
  assignedTasks: { title: string }[] = [],
  focusSummary?: string
): string {
  const input = userInput.toLowerCase();
  const prefix = focusSummary ? `I'm tracking ${focusSummary}. ` : "";
  const signOff = avatar.textBlocks?.signOff ? ` ${avatar.textBlocks.signOff}` : "";

  switch (avatar.id) {
    case "muse":
      return prefix + museResponse(input, assignedTasks) + signOff;
    case "accomplice":
      return prefix + accompliceResponse(input, assignedTasks) + signOff;
    case "skeptic":
      return prefix + skepticResponse(input, assignedTasks) + signOff;
    default:
      return `${prefix}[${avatar.givenName}]: I'm listening. You said: "${userInput}".${signOff}`;
  }
}

function museResponse(input: string, tasks: { title: string }[]): string {
  if (input.includes("idea") || input.includes("creative") || input.includes("what if")) {
    return "What if we pushed that further? Imagine the possibilities—there's always another angle waiting to emerge.";
  }
  if (input.includes("?") || input.includes("how") || input.includes("why")) {
    return "Questions open doors. Let's wander through a few—sometimes the best answer is the one we haven't thought of yet.";
  }
  if (tasks.length > 0 && (input.includes("task") || input.includes("doing") || input.includes("work"))) {
    return `I'm holding space for ${tasks.map((t) => `"${t.title}"`).join(", ")}. Let's keep the creative flow going.`;
  }
  return "I hear you. There's something generative in that—let it breathe a little. What wants to emerge?";
}

function accompliceResponse(input: string, tasks: { title: string }[]): string {
  if (input.includes("do") || input.includes("task") || input.includes("help") || input.includes("need")) {
    return "I'm on it. What's the first step? Let's break it down and get it done.";
  }
  if (input.includes("?") && (input.includes("how") || input.includes("when"))) {
    return "Here's the practical angle: we can start now. What do you need from me to make it happen?";
  }
  if (tasks.length > 0 && (input.includes("task") || input.includes("doing") || input.includes("progress"))) {
    return `I'm on ${tasks.length} task(s): ${tasks.map((t) => t.title).join(", ")}. Making progress.`;
  }
  return "I'm with you. Tell me what you need and we'll make it work.";
}

function skepticResponse(input: string, tasks: { title: string }[]): string {
  if (input.includes("sure") || input.includes("definitely") || input.includes("obviously")) {
    return "Hold on. What are we assuming here? 'Obviously' is where mistakes like to hide.";
  }
  if (input.includes("?") || input.includes("think") || input.includes("believe")) {
    return "Good question. But let's also ask: what would have to be true for the opposite to be right?";
  }
  if (tasks.length > 0 && (input.includes("task") || input.includes("sure"))) {
    return `We've got ${tasks.length} task(s) in play. Have we validated the assumptions behind them yet?`;
  }
  return "Interesting. What's the weakest part of that? If we're wrong, where would it show up first?";
}
