/**
 * Compact turn archive — append-only records for downstream processing (SPEC).
 */

import type {
  Avatar,
  CompactTurnRecord,
  EmailFocusArtifacts,
  ReplyRoutingDiagnostic,
  SituationFocus,
  SwitchboardTraceStep,
  WorldviewToolResolutionFailure,
} from "../types";

export const TURN_ARCHIVE_KEY = "avatars_turn_archive";
const MAX_ENTRIES = 1000;
const USER_PREVIEW_MAX = 80;
const REPLY_PREVIEW_MAX = 60;

export function loadArchive(): CompactTurnRecord[] {
  try {
    const raw = localStorage.getItem(TURN_ARCHIVE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as CompactTurnRecord[];
  } catch {
    return [];
  }
}

export function appendTurn(record: CompactTurnRecord): void {
  try {
    const arr = loadArchive();
    arr.push(record);
    while (arr.length > MAX_ENTRIES) arr.shift();
    localStorage.setItem(TURN_ARCHIVE_KEY, JSON.stringify(arr));
  } catch {
    /* ignore quota */
  }
}

export function truncateUserPreview(s: string): string {
  const t = s.trim();
  if (t.length <= USER_PREVIEW_MAX) return t;
  return t.slice(0, USER_PREVIEW_MAX) + "…";
}

function replyPreview(content: string): string {
  const t = content.trim().replace(/\s+/g, " ");
  if (t.length <= REPLY_PREVIEW_MAX) return t;
  return t.slice(0, REPLY_PREVIEW_MAX) + "…";
}

function compactList(values: string[] | undefined, max = 4): string[] | undefined {
  if (!values?.length) return undefined;
  const out = values
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, max);
  return out.length ? out : undefined;
}

function compactFailures(
  failures: WorldviewToolResolutionFailure[] | undefined
): WorldviewToolResolutionFailure[] | undefined {
  if (!failures?.length) return undefined;
  return failures.slice(0, 3).map((f) => ({
    tool: f.tool.slice(0, 120),
    error: f.error.slice(0, 120),
    argsPreview: f.argsPreview?.slice(0, 180),
  }));
}

/** One-line routing summary for inline UI */
export function formatTraceOneLine(trace: SwitchboardTraceStep[]): string {
  return trace
    .map((step) => `${step.selection}:${step.responderIds.join("+")}`)
    .join(" → ");
}

/** Trace plus optional focus abbrev (e/c/p) for inline UI */
export function formatTurnMetaLine(turn: CompactTurnRecord): string {
  const parts: string[] = [];
  if (turn.focus) {
    const bits: string[] = [];
    if (turn.focus.emailId) bits.push("e");
    if (turn.focus.calendarId) bits.push("c");
    if (turn.focus.contactId) bits.push("p");
    if (turn.focus.projectId) bits.push("t");
    if (bits.length) parts.push(`focus:${bits.join("+")}`);
  }
  if (turn.emailFocusArtifacts) {
    const a = turn.emailFocusArtifacts;
    parts.push(
      `emailPrep:${a.relevance}${a.cacheHit ? ":cache" : ":fresh"}`
    );
  }
  if (turn.replyDiagnostics?.some((d) => d.postTurnUi?.kind === "avatar_creation_offer")) {
    parts.push("ui:avatar_creation_offer");
  } else if (
    turn.replyDiagnostics?.some(
      (d) => (d.parsedToolNames?.length ?? 0) > 0 || (d.executedToolNames?.length ?? 0) > 0
    )
  ) {
    parts.push("tools");
  }
  parts.push(formatTraceOneLine(turn.switchboardTrace));
  return parts.join(" · ");
}

const SHORT_ID_DISPLAY = 14;

function shortenId(id: string | undefined): string {
  if (!id) return "";
  if (id.length <= SHORT_ID_DISPLAY) return id;
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

/** Compact multi-line detail for “routing + log” mode (inline, no panel). */
export function getTurnLogDetailLines(
  turn: CompactTurnRecord,
  avatars: Avatar[]
): string[] {
  const lines: string[] = [];
  lines.push(`time ${new Date(turn.ts).toLocaleString()}`);
  lines.push(`user ${turn.userPreview}`);
  const routing =
    turn.routingMode === "switchboard"
      ? "switchboard"
      : turn.forcedResponderIds?.length
        ? turn.forcedResponderIds.join("+")
        : turn.primaryAvatarId || "(none)";
  lines.push(`primary ${routing} · msg ${shortenId(turn.userMessageId)}`);
  if (turn.focus) {
    const f = turn.focus;
    const parts: string[] = [];
    if (f.emailId) parts.push(`email ${shortenId(f.emailId)}`);
    if (f.calendarId) parts.push(`cal ${shortenId(f.calendarId)}`);
    if (f.contactId) parts.push(`contact ${shortenId(f.contactId)}`);
    if (f.projectId) parts.push(`project ${shortenId(f.projectId)}`);
    if (parts.length) lines.push(parts.join(" · "));
  }
  if (turn.emailFocusArtifacts) {
    const a = turn.emailFocusArtifacts;
    lines.push(
      `email prep: ${a.relevance} · ${a.cacheHit ? "cache" : "fresh"}${a.threadId ? ` · thread ${shortenId(a.threadId)}` : ""}`
    );
  }
  for (const step of turn.switchboardTrace) {
    lines.push(
      `trace d${step.depth} ${step.selection} [${step.responderIds.join(", ")}]`
    );
  }
  for (const r of turn.replySummary) {
    const name =
      avatars.find((a) => a.id === r.avatarId)?.givenName ?? r.avatarId;
    lines.push(`${name}: ${r.preview ?? ""}`);
  }
  for (const d of turn.replyDiagnostics ?? []) {
    const name = avatars.find((a) => a.id === d.avatarId)?.givenName ?? d.avatarId;
    const intent = d.detectedToolIntent ?? "none";
    const expected = d.expectedToolNames?.length
      ? ` -> expected ${d.expectedToolNames.join(", ")}`
      : "";
    lines.push(`${name} logic: source ${d.replySource} · intent ${intent}${expected}`);
    if (d.rulesSkipReason) lines.push(`${name} rules: ${d.rulesSkipReason}`);
    if (d.ruleBlockIds?.length) lines.push(`${name} rule blocks: ${d.ruleBlockIds.join(", ")}`);
    const parsed = d.parsedToolNames?.length ? d.parsedToolNames.join(", ") : "none";
    const executed = d.executedToolNames?.length ? d.executedToolNames.join(", ") : "none";
    lines.push(`${name} tools: parsed ${parsed}; executed ${executed}`);
    if (d.parseHints?.length) {
      lines.push(`${name} parse hints: ${d.parseHints.join(" | ")}`);
    }
    for (const f of d.toolFailures ?? []) {
      lines.push(`${name} tool failure: ${f.tool}: ${f.error}`);
    }
    if (d.postTurnUi?.kind === "avatar_creation_offer") {
      const bits = [
        d.postTurnUi.wikiQuery ? `wikiQuery=${d.postTurnUi.wikiQuery}` : "",
        d.postTurnUi.seedText ? "seedText" : "",
        d.postTurnUi.reason ? `reason=${d.postTurnUi.reason}` : "",
      ].filter(Boolean);
      lines.push(`${name} post-turn UI: avatar creation offer${bits.length ? ` · ${bits.join(" · ")}` : ""}`);
    }
  }
  return lines;
}

export function buildCompactTurnRecord(
  userMessageId: string,
  userContent: string,
  focus: SituationFocus | undefined,
  forcedResponderIds: string[] | undefined,
  trace: SwitchboardTraceStep[],
  responses: Array<{
    avatarId: string;
    content: string;
    replySource?: ReplyRoutingDiagnostic["replySource"];
    rulesSkipReason?: ReplyRoutingDiagnostic["rulesSkipReason"];
    promptDebug?: {
      ruleBlockIds?: string[];
      turnToolIntent?: ReplyRoutingDiagnostic["detectedToolIntent"];
      worldviewParsedToolIntentNames?: string[];
      worldviewExecutedToolNames?: string[];
      worldviewParseHints?: string[];
      worldviewParseReason?: string | null;
    };
    worldviewParseDiagnosis?: {
      hints: string[];
      reason: string | null;
    };
    toolResolutionFailures?: WorldviewToolResolutionFailure[];
    postTurnUi?: {
      navigateAvatarCreationWorkshop?: {
        seedText?: string;
        wikiQuery?: string;
      };
    };
    postTurnUiReason?: string;
    suppressUserMessage?: boolean;
  }>,
  emailFocusArtifacts?: EmailFocusArtifacts
): CompactTurnRecord {
  const routingMode =
    forcedResponderIds && forcedResponderIds.length > 0 ? "forced" : "switchboard";
  const primaryAvatarId =
    forcedResponderIds && forcedResponderIds.length > 0
      ? forcedResponderIds[0]
      : "";
  return {
    id: crypto.randomUUID(),
    ts: Date.now(),
    userMessageId,
    userPreview: truncateUserPreview(userContent),
    focus: focus
      ? {
          emailId: focus.email?.id,
          calendarId: focus.calendar?.id,
          contactId: focus.contact?.id,
          projectId: focus.project?.id,
        }
      : undefined,
    primaryAvatarId,
    routingMode,
    forcedResponderIds:
      forcedResponderIds && forcedResponderIds.length > 0
        ? [...forcedResponderIds]
        : undefined,
    switchboardTrace: trace,
    ...(emailFocusArtifacts ? { emailFocusArtifacts } : {}),
    replySummary: responses
      .filter((r) => !r.suppressUserMessage)
      .map((r) => ({
        avatarId: r.avatarId,
        preview: replyPreview(r.content),
      })),
    replyDiagnostics: responses.map((r) => {
      const detectedToolIntent = r.promptDebug?.turnToolIntent;
      const postTurnIntent = r.postTurnUi?.navigateAvatarCreationWorkshop;
      const expectedToolNames =
        detectedToolIntent === "creation" ? ["avatars.workshop.open_draft"] : undefined;
      return {
        avatarId: r.avatarId,
        replySource: r.replySource ?? "other",
        rulesSkipReason: r.rulesSkipReason,
        ruleBlockIds: compactList(r.promptDebug?.ruleBlockIds, 8),
        detectedToolIntent,
        expectedToolNames,
        parsedToolNames: compactList(r.promptDebug?.worldviewParsedToolIntentNames),
        executedToolNames: compactList(r.promptDebug?.worldviewExecutedToolNames),
        parseHints: compactList(
          r.worldviewParseDiagnosis?.hints ?? r.promptDebug?.worldviewParseHints,
          3
        ),
        parseReason:
          r.worldviewParseDiagnosis?.reason ?? r.promptDebug?.worldviewParseReason,
        toolFailures: compactFailures(r.toolResolutionFailures),
        postTurnUi: postTurnIntent
          ? {
              kind: "avatar_creation_offer",
              seedText: postTurnIntent.seedText?.slice(0, 160),
              wikiQuery: postTurnIntent.wikiQuery?.slice(0, 160),
              reason: r.postTurnUiReason,
            }
          : undefined,
      } satisfies ReplyRoutingDiagnostic;
    }),
  };
}
