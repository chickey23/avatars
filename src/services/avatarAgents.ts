/**
 * Avatar Interface Agents - one per Primary Avatar.
 * Each receives full Situation Context and generates responses.
 */

import type {
  Avatar,
  AvatarAgentResult,
  OllamaPromptDebug,
  PostTurnAvatarUi,
  SituationContext,
  WorldviewActivityAction,
  WorldviewToolResolutionFailure,
} from "../types";
import { getRecentConversation } from "./situationContext";
import { getTasksForAvatar } from "./longTermTasks";
import { getOllamaPresence, generateWithOllama } from "./ollama";
import { appendSessionLog } from "./sessionLog";
import { getRuleBodiesForAvatar } from "./avatarRules";
import { formatPendingNotificationsForPrompt } from "./pendingNotifications";
import {
  resolveBehaviorTuning,
  formatBehaviorTuningForOllama,
  formatOllamaClosingInstruction,
  formatBehaviorTuningRulesPrefix,
  compressRulesBodyForEngagement,
  type ResolvedBehaviorTuning,
} from "./behaviorTuningFormat";
import { detectTurnToolIntent, type TurnToolIntent } from "./turnToolIntent";
import { scrubTranscriptForModel } from "./modelTranscript";
import {
  splitWorldviewToolsFromReply,
  type WorldviewToolCall,
} from "./worldviewTools/parse";
import { summarizePatchProjectsForActivity } from "./worldviewTools/patchProjectsSummary";
import {
  diagnoseWorldviewToolReply,
  formatWorldviewParseDiagnosisForLog,
} from "./worldviewTools/diagnose";
import { executeWorldviewTools } from "./worldviewTools/execute";
import { appendWorldviewAuditRecord } from "./worldviewAudit";
import { formatWorldviewToolArgsForAudit } from "./worldviewAuditArgsPreview";
import { getWorldMetadata } from "./worldMetadata/store";
import type { UserProfileRecord } from "./worldMetadata/types";
import {
  executeGmailFetchMessageBodyTools,
  partitionWorldviewTools,
} from "./gmailFetchTools";
import { formatRelevantDataForOllamaPrompt } from "./relevantContextPrompt";
import { getRoutingScoreForAvatar } from "./routingScore";
import { managedProjectIdsForAvatar } from "./avatarRoster";
import {
  dedupeWorldviewToolCalls,
  parseLexicalAgenticLines,
  scanLexicalMalformedTriggers,
  stripLexicalToolSyntaxFromVisible,
} from "./agenticTools";
import { renderWorkshopGuidanceForPrompt } from "./toolWorkshop";
import { recordToolTelemetryForOllamaTurn } from "./toolTelemetry";
import { avatarMayUseAgenticTool } from "./agenticTools/registry";
import {
  renderToolProtocol,
  resolveToolProfile,
  usesExplicitAllowlistGeneralHint,
  type ToolProfileId,
} from "./agenticTools/toolProtocol";

/** Machine token: reply with exactly this (alone) when you have nothing to add (single-wave mode). */
export const AVATARS_NO_COMMENT = "AVATARS_NO_COMMENT";

export {
  worldviewToolInstructionsForAvatar,
} from "./agenticTools/toolProtocol";

function buildWorldviewToolsPrompt(
  isExecutor: boolean,
  managedProjectIds: string[],
  instructionsBody: string,
  profile: ToolProfileId
): string {
  if (profile === "none") {
    return instructionsBody;
  }
  if (isExecutor) {
    return `${instructionsBody}

**Routing executor:** when the user asks to add a **new** tracked project, you **must** persist it with world_metadata.patch_projects using a fresh opaque id and a required title in this turn when appropriate.`;
  }
  const managed =
    managedProjectIds.length > 0
      ? ` You may patch **existing** projects only for these ids: ${managedProjectIds.join(", ")}.`
      : "";
  return `${instructionsBody}

**Participant:** do not create brand-new world_metadata.patch_projects ids.${managed} New tracked projects are created by the routing executor for this wave.`;
}

function expectedToolNameForRepair(
  intent: TurnToolIntent,
  avatar: Avatar
): string | null {
  if (
    intent === "creation" &&
    avatarMayUseAgenticTool(avatar, "avatars.workshop.open_draft")
  ) {
    return "avatars.workshop.open_draft";
  }
  if (
    intent === "email_fetch" &&
    avatarMayUseAgenticTool(avatar, "gmail.fetch_message_body")
  ) {
    return "gmail.fetch_message_body";
  }
  if (intent === "fact_save") {
    const a = avatar.allowedAgenticToolIds;
    if (a?.includes("world_metadata.patch_projects")) {
      return "world_metadata.patch_projects";
    }
    if (a?.includes("user_profile.patch")) return "user_profile.patch";
    if (a?.includes("world_metadata.patch_people")) {
      return "world_metadata.patch_people";
    }
    if (!a || a.length === 0) return "world_metadata.patch_projects";
  }
  return null;
}

/**
 * Routing may mark an avatar as "executor" for structural tools, but the Ollama
 * prompt must not demand `world_metadata.patch_projects` when this avatar is
 * not permitted to call it (e.g. Blessed Exchequer — creation workshop only).
 */
export function effectiveProjectExecutorForPrompt(
  isExecutorRouting: boolean,
  avatar: Avatar
): boolean {
  return (
    isExecutorRouting &&
    avatarMayUseAgenticTool(avatar, "world_metadata.patch_projects")
  );
}

const SINGLE_WAVE_REPLY_INSTRUCTION = `

**Single-wave routing:** If you have nothing substantive to add to this turn, reply with exactly one line:
${AVATARS_NO_COMMENT}
and nothing else (no greeting, no punctuation around it). If you do have something to say, respond normally; you may still use tools below.`;

function isRevertiblePatchToolName(name: string): boolean {
  return (
    name === "world_metadata.patch_projects" ||
    name === "world_metadata.patch_people" ||
    name === "user_profile.patch"
  );
}

function zipOkRevertiblePatchTools(
  patchTools: WorldviewToolCall[],
  results: { name: string; ok: boolean }[]
): WorldviewToolCall[] {
  const out: WorldviewToolCall[] = [];
  for (let i = 0; i < patchTools.length; i++) {
    const t = patchTools[i]!;
    const r = results[i];
    if (r?.ok && isRevertiblePatchToolName(t.name)) out.push(t);
  }
  return out;
}

function mergeJsonAndLexicalTools(
  rawReply: string,
  envelopeTools: WorldviewToolCall[] | undefined
): WorldviewToolCall[] {
  const lexical = parseLexicalAgenticLines(rawReply);
  return dedupeWorldviewToolCalls([
    ...lexical,
    ...(envelopeTools ?? []),
  ]);
}

const MAX_ACT_SUMMARY = 180;

function clampActSummary(s: string): string {
  const t = s.trim();
  return t.length <= MAX_ACT_SUMMARY ? t : `${t.slice(0, MAX_ACT_SUMMARY - 1)}…`;
}

function summarizeExecutedPatchTool(t: WorldviewToolCall): string {
  switch (t.name) {
    case "user_profile.patch": {
      const p = t.args.patch as Record<string, unknown> | undefined;
      if (!p) return "user_profile.patch";
      const keys = Object.keys(p).filter(
        (k) => p[k] != null && String(p[k]).trim() !== ""
      );
      return clampActSummary(keys.length ? `patch fields: ${keys.join(", ")}` : "user_profile.patch");
    }
    case "world_metadata.patch_projects": {
      const patch = t.args.patch as Record<string, unknown> | undefined;
      return summarizePatchProjectsForActivity(patch);
    }
    case "world_metadata.patch_people": {
      const patch = t.args.patch as Record<string, unknown> | undefined;
      const n = patch ? Object.keys(patch).length : 0;
      const ids = patch ? Object.keys(patch).slice(0, 4).join(", ") : "";
      return clampActSummary(`${n} contact(s)${ids ? `: ${ids}` : ""}`);
    }
    case "avatars.workshop.open_draft": {
      const a = t.args as Record<string, unknown>;
      const parts: string[] = [];
      if (typeof a.wikiQuery === "string" && a.wikiQuery.trim()) {
        const q = a.wikiQuery.trim();
        parts.push(`wiki: ${q.length > 72 ? `${q.slice(0, 71)}…` : q}`);
      }
      if (typeof a.seedText === "string" && a.seedText.trim()) {
        parts.push("seed");
      }
      return clampActSummary(
        parts.length > 0 ? `creation workshop (${parts.join("; ")})` : t.name
      );
    }
    default:
      return clampActSummary(t.name);
  }
}

function mergePostTurnUi(
  a: PostTurnAvatarUi | undefined,
  b: PostTurnAvatarUi | undefined
): PostTurnAvatarUi | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    navigateAvatarCreationWorkshop:
      b.navigateAvatarCreationWorkshop ?? a.navigateAvatarCreationWorkshop,
  };
}

function postTurnUiFromOpenDraftTools(
  tools: WorldviewToolCall[],
  results: { name: string; ok: boolean; error?: string }[]
): PostTurnAvatarUi | undefined {
  let last: PostTurnAvatarUi | undefined;
  for (let i = 0; i < tools.length && i < results.length; i++) {
    const t = tools[i]!;
    const r = results[i]!;
    if (!r.ok || t.name !== "avatars.workshop.open_draft") continue;
    const a = t.args as Record<string, unknown>;
    const seedText =
      typeof a.seedText === "string" ? a.seedText.trim().slice(0, 2000) : "";
    const wikiQuery =
      typeof a.wikiQuery === "string" ? a.wikiQuery.trim().slice(0, 500) : "";
    if (!seedText && !wikiQuery) continue;
    last = {
      navigateAvatarCreationWorkshop: {
        ...(seedText ? { seedText } : {}),
        ...(wikiQuery ? { wikiQuery } : {}),
      },
    };
  }
  return last;
}

function summarizeFetchToolLine(messageId: string, ok: boolean, err?: string): string {
  const id =
    messageId.length > 28 ? `${messageId.slice(0, 25)}…` : messageId;
  if (ok) return clampActSummary(`fetched email body (${id})`);
  return clampActSummary(`fetch ${err ?? "failed"} (${id})`);
}

function dedupeResolutionErrors(errs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of errs) {
    const t = e.trim().slice(0, 240);
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function dedupeResolutionFailures(
  failures: WorldviewToolResolutionFailure[]
): WorldviewToolResolutionFailure[] {
  const out: WorldviewToolResolutionFailure[] = [];
  const seen = new Set<string>();
  for (const f of failures) {
    const tool = f.tool.trim() || "(unknown)";
    const err = f.error.trim() || "failed";
    const ap = f.argsPreview?.trim() ?? "";
    const key = `${tool}\0${err}\0${ap}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      tool,
      error: err,
      argsPreview: f.argsPreview?.trim() || undefined,
    });
  }
  return out;
}

function failuresToLegacyErrorStrings(
  failures: WorldviewToolResolutionFailure[]
): string[] {
  return failures.map((f) => {
    const ap = f.argsPreview;
    if (!ap) return `${f.tool}: ${f.error}`;
    const oneLine = ap.replace(/\s+/g, " ").trim();
    const short =
      oneLine.length > 100 ? `${oneLine.slice(0, 97).trimEnd()}…` : oneLine;
    return `${f.tool}: ${f.error} (${short})`;
  });
}

/** Models often omit the middle "S" or add markdown / punctuation around the token. */
const AVATAR_NO_COMMENT_ALIAS = "AVATAR_NO_COMMENT";

function stripNoCommentMarkdownNoise(line: string): string {
  let t = line.trim();
  t = t.replace(/^[`"'*_]+|[`"'*_]+$/g, "").trim();
  t = t.replace(/[.!?:;]+$/g, "").trim();
  return t;
}

function lineIsNoCommentToken(line: string): boolean {
  const t = stripNoCommentMarkdownNoise(line);
  if (t === "") return false;
  for (const token of [AVATARS_NO_COMMENT, AVATAR_NO_COMMENT_ALIAS]) {
    if (new RegExp(`^${token}\\s*$`, "i").test(t)) return true;
  }
  return false;
}

/** Single shared regex for "token appears anywhere in the text" checks. */
const NO_COMMENT_TOKEN_ANYWHERE = /\bAVATARS?_NO_COMMENT\b/i;

/**
 * Treat reply as no-comment when the token appears on its own line anywhere
 * in the visible output, or when the visible output is empty after stripping.
 * Models sometimes pair prose with the token ("Sure.\nAVATARS_NO_COMMENT");
 * the user's intent there is still suppression.
 * Exported for unit tests.
 */
export function isAvatarsNoCommentOnly(visible: string): boolean {
  const lines = visible
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return true;
  for (const line of lines) {
    if (lineIsNoCommentToken(line)) return true;
  }
  /** Token pasted inline after prose ("You're welcome. AVATARS_NO_COMMENT"). */
  return NO_COMMENT_TOKEN_ANYWHERE.test(visible);
}

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

  const tuning = resolveBehaviorTuning(ctx);
  const presence = await getOllamaPresence();
  if (presence === "ready") {
    const minScore = ctx.preflightOllamaMinScore;
    if (minScore !== undefined) {
      const score = getRoutingScoreForAvatar(
        avatar,
        userContent,
        undefined,
        ctx.avatarRosterPriorityScoreById
      );
      if (score < minScore) {
        appendSessionLog("chat", "preflight_skip", {
          level: "info",
          detail: `${avatar.id} score=${score} min=${minScore} (no Ollama call)`,
        });
        const preflightDebug: OllamaPromptDebug = {
          givenName: avatar.givenName,
          personality: avatar.personality,
          interests: [...avatar.interests],
          tasks: tasks.map((t) => ({ title: t.title })),
          activeTask: ctx.activeTask,
          relevantData: ctx.relevantData ? [...ctx.relevantData] : [],
          recentTranscript: recent.map((m) => `${m.role}: ${m.content}`).join("\n"),
          fullPrompt: "(preflight skip — Ollama not called; routing score below threshold)",
          ruleBlockIds,
          preflightSkip: { score, threshold: minScore },
        };
        return {
          content: "",
          replySource: "rules",
          rulesSkipReason: "preflight_low_score",
          suppressUserMessage: true,
          preflightSkip: { score, threshold: minScore },
          promptDebug: preflightDebug,
        };
      }
    }

    const pendingForAvatar =
      ctx.pendingNotifications?.filter((p) => p.avatarId === avatar.id) ?? [];
    const pendingBlock = formatPendingNotificationsForPrompt(
      pendingForAvatar,
      ctx.pendingReleaseClusterIds
    );
    const isExec =
      Boolean(ctx.executorAvatarIdForTurn) &&
      ctx.executorAvatarIdForTurn === avatar.id;
    const toolsPromptExecutor = effectiveProjectExecutorForPrompt(isExec, avatar);
    const turnIntent = detectTurnToolIntent(userContent);
    const toolProfile = resolveToolProfile(avatar, turnIntent);
    const protocolBody = renderToolProtocol(toolProfile, avatar);
    const allowListHint = usesExplicitAllowlistGeneralHint(avatar)
      ? `\n\n**Allowed structured tools for you:** ${avatar.allowedAgenticToolIds!.join(", ")}. In the JSON \`tools\` array, use only these tool names (or omit the JSON block). Do not invent other tool APIs (e.g. wikipedia.search).`
      : "";
    const workshopBlock = renderWorkshopGuidanceForPrompt();
    let toolsBase = buildWorldviewToolsPrompt(
      toolsPromptExecutor,
      managedProjectIdsForAvatar(avatar.id),
      `${protocolBody}${allowListHint}`,
      toolProfile
    );
    if (workshopBlock) {
      toolsBase = `${toolsBase}\n\n${workshopBlock}`;
    }
    const chatRulesOnly = rulesText?.trim() ?? "";
    const recentForPrompt = scrubTranscriptForModel(
      recent.map((m) => ({ role: m.role, content: m.content }))
    );
    const fullPrompt = buildOllamaPrompt(
      avatar,
      userContent,
      recentForPrompt,
      tasks,
      ctx.activeTask,
      ctx.relevantData,
      chatRulesOnly,
      toolsBase,
      pendingBlock,
      tuning,
      {
        switchboardRoutingMode: ctx.switchboardRoutingMode,
        responseRequirement: lastUser?.responseRequirement,
        isExecutor: toolsPromptExecutor,
        toolProfile,
        turnIntent,
      }
    );
    const debug: OllamaPromptDebug = {
      givenName: avatar.givenName,
      personality: avatar.personality,
      interests: [...avatar.interests],
      tasks: tasks.map((t) => ({ title: t.title })),
      activeTask: ctx.activeTask,
      relevantData: ctx.relevantData ? [...ctx.relevantData] : [],
      recentTranscript: recent.map((m) => `${m.role}: ${m.content}`).join("\n"),
      recentTranscriptScrubbed: recentForPrompt
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n"),
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
    let gen = await generateWithOllama({ prompt: fullPrompt });
    if (gen.ok) {
      const activityActions: WorldviewActivityAction[] = [];
      const activityNames = new Set<string>();

      let rawText = gen.text;
      let split = splitWorldviewToolsFromReply(rawText);
      let mergedTools = mergeJsonAndLexicalTools(rawText, split.envelope?.tools);
      let parseDiagnosis = diagnoseWorldviewToolReply(rawText, split.envelope);
      if (mergedTools.length > 0) {
        parseDiagnosis = { hints: [], reason: null };
      }

      const expectedRepairTool = expectedToolNameForRepair(turnIntent, avatar);
      const needsRepair =
        mergedTools.length === 0 &&
        parseDiagnosis.hints.length > 0 &&
        turnIntent !== "none" &&
        expectedRepairTool != null &&
        toolProfile !== "none";

      if (needsRepair) {
        const repairPrompt = `${fullPrompt}\n\n---\n**Repair:** Your previous output did not parse as a valid \`avatars_tools_v1\` JSON block. Reply with **only** one markdown \`\`\`json code block (no other text) containing a valid envelope for tool name \`${expectedRepairTool}\` with appropriate \`args\` for the user's message.\n\nPrevious output (excerpt):\n${rawText.slice(0, 400)}`;
        appendSessionLog("chat", "ollama_tool_parse_repair", {
          level: "info",
          detail: `${avatar.id} intent=${turnIntent} tool=${expectedRepairTool}`,
        });
        const genRepair = await generateWithOllama({ prompt: repairPrompt });
        if (genRepair.ok) {
          gen = genRepair;
          rawText = genRepair.text;
          split = splitWorldviewToolsFromReply(rawText);
          mergedTools = mergeJsonAndLexicalTools(rawText, split.envelope?.tools);
          parseDiagnosis = diagnoseWorldviewToolReply(rawText, split.envelope);
          if (mergedTools.length > 0) {
            parseDiagnosis = { hints: [], reason: null };
          }
        }
      }

      const lexicalMalformed = scanLexicalMalformedTriggers(rawText);
      const resolutionFailures: WorldviewToolResolutionFailure[] =
        lexicalMalformed.map((issue) => ({
          tool: "lexical",
          error: "malformed",
          argsPreview:
            issue.length > 280 ? `${issue.slice(0, 279)}…` : issue,
        }));

      const { visible, envelope } = split;
      let worldviewToolSummary: AvatarAgentResult["worldviewToolSummary"];
      let worldviewActivity: AvatarAgentResult["worldviewActivity"] | undefined;
      let finalVisible = visible;
      let rawModelReply = rawText;
      let postTurnUi: PostTurnAvatarUi | undefined;
      if (parseDiagnosis.hints.length) {
        appendSessionLog("chat", "worldview_tools_parse_mismatch", {
          level: "warn",
          detail: `${avatar.id}: ${formatWorldviewParseDiagnosisForLog(parseDiagnosis)}`,
        });
      }

      if (mergedTools.length > 0) {
        const { fetchTools, patchTools } = partitionWorldviewTools(mergedTools);
        const combinedPatchResults: { name: string; ok: boolean; error?: string }[] =
          [];
        const revertiblePatchCalls: WorldviewToolCall[] = [];
        let userProfileBeforeAudit: UserProfileRecord | undefined;

        const captureProfileIfNeeded = () => {
          if (userProfileBeforeAudit === undefined) {
            userProfileBeforeAudit = { ...getWorldMetadata().userProfile };
          }
        };

        if (patchTools.length) {
          captureProfileIfNeeded();
          const r1 = executeWorldviewTools(patchTools, {
            avatarId: avatar.id,
            userMessageId: ctx.replyToUserMessageId ?? "",
            sourceEmailId: ctx.userFocus?.email?.id,
            skipAudit: true,
            avatar,
            executorAvatarId: ctx.executorAvatarIdForTurn,
          });
          for (let i = 0; i < r1.length; i++) {
            const r = r1[i]!;
            const t = patchTools[i]!;
            if (r.ok) {
              activityNames.add(t.name);
              activityActions.push({
                tool: t.name,
                summary: summarizeExecutedPatchTool(t),
              });
            } else {
              resolutionFailures.push({
                tool: t.name,
                error: r.error ?? "failed",
                argsPreview: formatWorldviewToolArgsForAudit(t),
              });
            }
          }
          combinedPatchResults.push(...r1);
          revertiblePatchCalls.push(
            ...zipOkRevertiblePatchTools(patchTools, r1)
          );
          postTurnUi = mergePostTurnUi(
            postTurnUi,
            postTurnUiFromOpenDraftTools(patchTools, r1)
          );
        }

        let fetchAuditRows: {
          name: string;
          ok: boolean;
          error?: string;
          detail?: string;
        }[] = [];
        let secondPatchTools: WorldviewToolCall[] = [];

        if (fetchTools.length) {
          const fetchOut = await executeGmailFetchMessageBodyTools(
            fetchTools,
            ctx.turnEmailFetchAllowlist,
            avatar
          );
          fetchAuditRows = fetchOut.results;
          for (let i = 0; i < fetchTools.length; i++) {
            const t = fetchTools[i]!;
            const r = fetchAuditRows[i]!;
            const args = t.args as { messageId?: unknown };
            const messageId =
              typeof args.messageId === "string"
                ? args.messageId.trim()
                : typeof r.detail === "string"
                  ? r.detail
                  : "";
            if (r.ok) {
              activityNames.add(t.name);
              activityActions.push({
                tool: t.name,
                summary: summarizeFetchToolLine(messageId, true),
              });
            } else {
              resolutionFailures.push({
                tool: t.name,
                error: r.error ?? "failed",
                argsPreview: formatWorldviewToolArgsForAudit(t),
              });
            }
          }

          if (fetchOut.anySuccess) {
            const followUp =
              `${fullPrompt}\n\n---\nFetched email bodies (tools; authoritative for these message ids):\n${fetchOut.bodyBlocks.join("\n\n")}\n\nReply to the user in natural language. Use this content when it answers their question. Do not repeat raw JSON tool blocks unless you still need to update saved world metadata (projects, contacts, user profile).`;
            appendSessionLog(
              "chat",
              `Ollama follow-up (${avatar.id}) after gmail.fetch_message_body`,
              {
                level: "info",
                detail: `${fetchOut.bodyBlocks.length} body block(s)`,
              }
            );
            const gen2 = await generateWithOllama({ prompt: followUp });
            if (gen2.ok) {
              const split2 = splitWorldviewToolsFromReply(gen2.text);
              finalVisible = split2.visible;
              rawModelReply = gen2.text;
              const merged2 = mergeJsonAndLexicalTools(
                gen2.text,
                split2.envelope?.tools
              );
              parseDiagnosis = diagnoseWorldviewToolReply(
                gen2.text,
                split2.envelope
              );
              if (merged2.length > 0) {
                parseDiagnosis = { hints: [], reason: null };
              }
              if (parseDiagnosis.hints.length) {
                appendSessionLog("chat", "worldview_tools_parse_mismatch", {
                  level: "warn",
                  detail: `${avatar.id} (follow-up): ${formatWorldviewParseDiagnosisForLog(parseDiagnosis)}`,
                });
              }
              if (merged2.length > 0) {
                const { patchTools: p2 } = partitionWorldviewTools(merged2);
                if (p2.length) {
                  secondPatchTools = p2;
                  captureProfileIfNeeded();
                  const r2 = executeWorldviewTools(p2, {
                    avatarId: avatar.id,
                    userMessageId: ctx.replyToUserMessageId ?? "",
                    sourceEmailId: ctx.userFocus?.email?.id,
                    skipAudit: true,
                    avatar,
                    executorAvatarId: ctx.executorAvatarIdForTurn,
                  });
                  for (let i = 0; i < r2.length; i++) {
                    const r = r2[i]!;
                    const t = p2[i]!;
                    if (r.ok) {
                      activityNames.add(t.name);
                      activityActions.push({
                        tool: t.name,
                        summary: summarizeExecutedPatchTool(t),
                      });
                    } else {
                      resolutionFailures.push({
                        tool: t.name,
                        error: r.error ?? "failed",
                        argsPreview: formatWorldviewToolArgsForAudit(t),
                      });
                    }
                  }
                  combinedPatchResults.push(...r2);
                  revertiblePatchCalls.push(
                    ...zipOkRevertiblePatchTools(p2, r2)
                  );
                  postTurnUi = mergePostTurnUi(
                    postTurnUi,
                    postTurnUiFromOpenDraftTools(p2, r2)
                  );
                }
              }
            }
          }
        }

        const toolsInOrder: WorldviewToolCall[] = [
          ...patchTools,
          ...secondPatchTools,
          ...fetchTools,
        ];
        const allForAudit = [...combinedPatchResults, ...fetchAuditRows].map(
          (r, i) => ({
            ...r,
            argsPreview:
              toolsInOrder[i] !== undefined
                ? formatWorldviewToolArgsForAudit(toolsInOrder[i]!)
                : undefined,
          })
        );
        if (allForAudit.length) {
          const hasUserProfileRevertible = revertiblePatchCalls.some(
            (t) => t.name === "user_profile.patch"
          );
          appendWorldviewAuditRecord({
            avatarId: avatar.id,
            userMessageId: ctx.replyToUserMessageId ?? "",
            sourceEmailId: ctx.userFocus?.email?.id,
            toolResults: allForAudit,
            revertiblePatchCalls:
              revertiblePatchCalls.length > 0
                ? revertiblePatchCalls
                : undefined,
            userProfileBefore: hasUserProfileRevertible
              ? userProfileBeforeAudit
              : undefined,
          });
        }

        if (activityNames.size > 0) {
          worldviewActivity = {
            names: [...activityNames],
            actions: activityActions,
          };
          worldviewToolSummary = { names: [...activityNames] };
        }
      }

      const finalSplit = splitWorldviewToolsFromReply(rawModelReply);
      const mergedFinal = mergeJsonAndLexicalTools(
        rawModelReply,
        finalSplit.envelope?.tools
      );
      debug.rawModelReply = rawModelReply;
      debug.worldviewParsedToolIntentNames = mergedFinal.map((t) => t.name);
      debug.worldviewExecutedToolNames =
        worldviewActivity?.names ?? worldviewToolSummary?.names ?? [];
      debug.worldviewParseHints =
        parseDiagnosis.hints.length > 0 ? parseDiagnosis.hints : undefined;
      debug.worldviewParseReason = parseDiagnosis.reason ?? undefined;

      const worldviewParseDiagnosis =
        parseDiagnosis.hints.length > 0
          ? {
              hints: parseDiagnosis.hints,
              reason: parseDiagnosis.reason,
            }
          : undefined;

      finalVisible = stripLexicalToolSyntaxFromVisible(finalVisible);
      const dedupedFailures = dedupeResolutionFailures(resolutionFailures);
      const toolResolutionFailures =
        dedupedFailures.length > 0 ? dedupedFailures : undefined;
      const toolResolutionErrors = toolResolutionFailures
        ? dedupeResolutionErrors(
            failuresToLegacyErrorStrings(toolResolutionFailures)
          )
        : undefined;

      const suppressUserMessage = isAvatarsNoCommentOnly(finalVisible);

      const successNames =
        worldviewActivity?.names ?? worldviewToolSummary?.names ?? [];
      const actionPreviewByTool = new Map(
        (worldviewActivity?.actions ?? []).map((a) => [a.tool, a.summary])
      );
      const telemetrySuccesses = successNames.map((toolId) => ({
        toolId,
        resultPreview: actionPreviewByTool.get(toolId),
      }));

      recordToolTelemetryForOllamaTurn({
        avatarId: avatar.id,
        userMessageId: ctx.replyToUserMessageId,
        successes: telemetrySuccesses,
        failures: toolResolutionFailures,
        parseHints:
          parseDiagnosis.hints.length > 0 ? parseDiagnosis.hints : undefined,
        hadMergedToolCalls: mergedFinal.length > 0,
        isExecutor: toolsPromptExecutor,
        switchboardRoutingMode: ctx.switchboardRoutingMode,
        turnIntent,
      });

      return {
        content: finalVisible,
        replySource: "ollama",
        promptDebug: debug,
        worldviewToolSummary,
        worldviewActivity,
        toolResolutionErrors,
        toolResolutionFailures,
        worldviewParseDiagnosis,
        suppressUserMessage,
        postTurnUi,
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
        shortFocusSummary(ctx.relevantData),
        tuning,
        ctx.relevantData
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
      shortFocusSummary(ctx.relevantData),
      tuning,
      ctx.relevantData
    ),
    replySource: "rules",
    rulesSkipReason: presence === "no_models" ? "no_models" : "unavailable",
  };
}

function shortFocusSummary(relevant?: string[]): string | undefined {
  const lines = relevant?.filter((s) => s.startsWith("focus:")) ?? [];
  if (!lines.length) return undefined;
  const parts: string[] = [];
  if (lines.some((l) => l.includes("focus: email"))) parts.push("a selected email");
  if (lines.some((l) => l.includes("focus: calendar"))) parts.push("a selected calendar event");
  if (lines.some((l) => l.includes("focus: contact"))) parts.push("a selected contact");
  if (lines.some((l) => l.includes("focus: project"))) parts.push("a selected project");
  return parts.join(", ");
}

/** Exported for prompt layout / integration tests. */
export function buildOllamaPrompt(
  avatar: Avatar,
  userInput: string,
  recent: { role: string; content: string }[],
  tasks: { title: string }[],
  activeTask: string | undefined,
  relevantData: string[] | undefined,
  chatRulesText: string,
  toolProtocolText: string,
  pendingBlock: string | undefined,
  tuning: ResolvedBehaviorTuning,
  routingExtras?: {
    switchboardRoutingMode?: "cascade" | "single_wave";
    responseRequirement?: "open" | "satisfied";
    isExecutor?: boolean;
    toolProfile?: ToolProfileId;
    turnIntent?: TurnToolIntent;
  }
): string {
  const context = recent.map((m) => `${m.role}: ${m.content}`).join("\n");
  const taskStr = tasks.length > 0 ? tasks.map((t) => t.title).join(", ") : "none";
  const dataBlock = formatRelevantDataForOllamaPrompt(relevantData);
  const preamble = avatar.textBlocks?.preamble
    ? `${avatar.textBlocks.preamble}\n\n`
    : "";
  const rulesBlock = chatRulesText
    ? `\nGuidelines (library rules):\n${chatRulesText}\n`
    : "";
  const toolBlock = toolProtocolText
    ? `\nTool protocol (machine contract — never narrate APIs in prose):\n${toolProtocolText}\n`
    : "";
  const pend = pendingBlock ? `\n${pendingBlock}\n` : "";
  const tuningBlock = `\n${formatBehaviorTuningForOllama(tuning)}\n`;
  const closing = formatOllamaClosingInstruction(avatar.givenName, tuning, {
    isExecutor: routingExtras?.isExecutor,
    toolProfile: routingExtras?.toolProfile,
    turnIntent: routingExtras?.turnIntent,
  });
  let responseRequirementNote = "";
  if (routingExtras?.responseRequirement === "satisfied") {
    responseRequirementNote =
      "\n**Turn context:** The user’s message is marked as satisfied / closure — brief acknowledgments are enough unless something new is needed.\n";
  }
  const singleWave =
    routingExtras?.switchboardRoutingMode === "single_wave"
      ? SINGLE_WAVE_REPLY_INSTRUCTION
      : "";
  return `${preamble}You are ${avatar.givenName}. Personality: ${avatar.personality}. Interests: ${avatar.interests.join(", ")}.
Current assigned tasks: ${taskStr}. Active task: ${activeTask ?? "none"}.
${rulesBlock}${dataBlock ? `\n${dataBlock}\n` : ""}${pend}${tuningBlock}${responseRequirementNote}${singleWave}${toolBlock}
Recent conversation:
${context}

User just said: "${userInput}"

${closing}`;
}

function generatePersonalityResponse(
  avatar: Avatar,
  userInput: string,
  _recent: { role: string; content: string; avatarId?: string }[],
  assignedTasks: { title: string }[] = [],
  focusSummary: string | undefined,
  tuning: ResolvedBehaviorTuning,
  relevantData?: string[]
): string {
  const input = userInput.toLowerCase();
  const tuningPrefix = formatBehaviorTuningRulesPrefix(tuning, {
    focusSummary,
    relevantData,
  });
  const legacyFocus =
    focusSummary && tuning.replyContextFocus < 50
      ? `I'm tracking ${focusSummary}. `
      : "";
  const signOff = avatar.textBlocks?.signOff ? ` ${avatar.textBlocks.signOff}` : "";

  let body: string;
  switch (avatar.id) {
    case "muse":
      body = legacyFocus + museResponse(input, assignedTasks);
      break;
    case "accomplice":
      body = legacyFocus + accompliceResponse(input, assignedTasks);
      break;
    case "skeptic":
      body = legacyFocus + skepticResponse(input, assignedTasks);
      break;
    default:
      body = `${legacyFocus}[${avatar.givenName}]: I'm listening. You said: "${userInput}".`;
  }
  body = compressRulesBodyForEngagement(tuning, body);
  return tuningPrefix + body + signOff;
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
