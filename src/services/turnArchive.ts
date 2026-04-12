/**
 * Compact turn archive — append-only records for downstream processing (SPEC).
 */

import type {
  Avatar,
  CompactTurnRecord,
  SituationFocus,
  SwitchboardTraceStep,
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
  return lines;
}

export function buildCompactTurnRecord(
  userMessageId: string,
  userContent: string,
  focus: SituationFocus | undefined,
  forcedResponderIds: string[] | undefined,
  trace: SwitchboardTraceStep[],
  responses: Array<{ avatarId: string; content: string }>
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
    replySummary: responses.map((r) => ({
      avatarId: r.avatarId,
      preview: replyPreview(r.content),
    })),
  };
}
