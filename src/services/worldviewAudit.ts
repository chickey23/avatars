/**
 * Append-only log of worldview tool applications (SPEC: attribution).
 */

import type { UserProfileRecord } from "./worldMetadata/types";
import type { WorldviewToolCall } from "./worldviewTools/parse";
import { revertWorldviewAuditRecordPatches } from "./worldviewRevert";

const KEY = "avatars_worldview_audit_v1";
const MAX_RECORDS = 200;

export type WorldviewAuditToolResult = {
  name: string;
  ok: boolean;
  error?: string;
  detail?: string;
  /** Truncated JSON of tool `args` for the audit UI (optional on older rows). */
  argsPreview?: string;
};

export type WorldviewAuditRecord = {
  id: string;
  ts: number;
  avatarId: string;
  userMessageId: string;
  sourceEmailId?: string;
  toolResults: WorldviewAuditToolResult[];
  /** Successful patch tool calls from this row (used to undo bad world metadata). */
  revertiblePatchCalls?: WorldviewToolCall[];
  /** Profile snapshot before any `user_profile.patch` in this row (revert target). */
  userProfileBefore?: UserProfileRecord;
  /** When set, user reverted patches from this row. */
  revertedAt?: number;
};

export function loadWorldviewAudit(): WorldviewAuditRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p as WorldviewAuditRecord[];
  } catch {
    return [];
  }
}

export function appendWorldviewAuditRecord(
  rec: Omit<WorldviewAuditRecord, "id" | "ts" | "revertedAt">
): void {
  try {
    const arr = loadWorldviewAudit();
    arr.push({
      id: crypto.randomUUID(),
      ts: Date.now(),
      ...rec,
    });
    while (arr.length > MAX_RECORDS) arr.shift();
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* quota */
  }
}

export function saveWorldviewAudit(records: WorldviewAuditRecord[]): void {
  try {
    const trimmed = records.slice(-MAX_RECORDS);
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    /* quota */
  }
}

/**
 * Undo world-metadata effects of one audit entry and mark it reverted.
 * @returns false if id missing, already reverted, or nothing revertible.
 */
export function applyWorldviewAuditRevert(id: string): boolean {
  const arr = loadWorldviewAudit();
  const idx = arr.findIndex((r) => r.id === id);
  if (idx < 0) return false;
  const rec = arr[idx]!;
  if (rec.revertedAt) return false;
  const hasPatches =
    (rec.revertiblePatchCalls?.length ?? 0) > 0 || !!rec.userProfileBefore;
  if (!hasPatches) return false;
  try {
    revertWorldviewAuditRecordPatches(rec);
  } catch {
    return false;
  }
  arr[idx] = { ...rec, revertedAt: Date.now() };
  saveWorldviewAudit(arr);
  return true;
}
