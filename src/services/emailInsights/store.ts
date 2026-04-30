import {
  EMAIL_INSIGHT_ACCESS_TTL_MS,
  EMAIL_INSIGHTS_SCHEMA_VERSION,
  EMAIL_INSIGHTS_STORAGE_KEY,
} from "./constants";
import { emailBodyContentHash } from "./hash";
import type { EmailInsightRecord, EmailInsightsDoc } from "./types";
import { emitSessionChangeDelta } from "../sessionChangeTelemetry";

function now(): number {
  return Date.now();
}

function createEmptyDoc(): EmailInsightsDoc {
  return { schemaVersion: EMAIL_INSIGHTS_SCHEMA_VERSION, entries: {} };
}

let memoryDoc: EmailInsightsDoc | null = null;

/** Vitest / dev only: clear in-memory cache after mutating localStorage. */
export function resetEmailInsightsMemoryForTests(): void {
  memoryDoc = null;
}

function pruneEntries(doc: EmailInsightsDoc): EmailInsightsDoc {
  const t = now();
  const next: Record<string, EmailInsightRecord> = {};
  for (const [id, row] of Object.entries(doc.entries)) {
    if (t - row.lastAccessedAt <= EMAIL_INSIGHT_ACCESS_TTL_MS) {
      next[id] = row;
    }
  }
  return { schemaVersion: EMAIL_INSIGHTS_SCHEMA_VERSION, entries: next };
}

export function loadEmailInsightsDoc(): EmailInsightsDoc {
  if (memoryDoc) return memoryDoc;
  try {
    const raw = localStorage.getItem(EMAIL_INSIGHTS_STORAGE_KEY);
    if (!raw) {
      memoryDoc = createEmptyDoc();
      return memoryDoc;
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      memoryDoc = createEmptyDoc();
      return memoryDoc;
    }
    const o = parsed as Record<string, unknown>;
    const entries = o.entries;
    if (o.schemaVersion !== 1 || !entries || typeof entries !== "object") {
      memoryDoc = createEmptyDoc();
      return memoryDoc;
    }
    memoryDoc = pruneEntries({
      schemaVersion: 1,
      entries: entries as Record<string, EmailInsightRecord>,
    });
    return memoryDoc;
  } catch {
    memoryDoc = createEmptyDoc();
    return memoryDoc;
  }
}

export function saveEmailInsightsDoc(doc: EmailInsightsDoc): void {
  memoryDoc = pruneEntries(doc);
  try {
    localStorage.setItem(EMAIL_INSIGHTS_STORAGE_KEY, JSON.stringify(memoryDoc));
  } catch {
    /* quota */
  }
}

/** Mark row accessed (extends TTL window). */
export function touchEmailInsight(messageId: string): void {
  const doc = loadEmailInsightsDoc();
  const row = doc.entries[messageId];
  if (!row) return;
  row.lastAccessedAt = now();
  saveEmailInsightsDoc(doc);
}

/** Read without updating lastAccessedAt (for hash check). */
export function peekEmailInsight(messageId: string): EmailInsightRecord | undefined {
  const doc = loadEmailInsightsDoc();
  const row = doc.entries[messageId];
  if (!row) return undefined;
  if (now() - row.lastAccessedAt > EMAIL_INSIGHT_ACCESS_TTL_MS) {
    return undefined;
  }
  return row;
}

export function getValidCachedInsight(
  messageId: string,
  body: string
): EmailInsightRecord | undefined {
  const row = peekEmailInsight(messageId);
  if (!row) return undefined;
  const h = emailBodyContentHash(body);
  if (row.contentHash !== h) return undefined;
  touchEmailInsight(messageId);
  return peekEmailInsight(messageId);
}

export function upsertEmailInsight(record: EmailInsightRecord): void {
  const doc = loadEmailInsightsDoc();
  const t = now();
  doc.entries[record.messageId] = {
    ...record,
    lastAccessedAt: t,
  };
  saveEmailInsightsDoc(doc);
  emitSessionChangeDelta(1);
}
