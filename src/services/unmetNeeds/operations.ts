import type { ToolTelemetryEvent } from "../toolTelemetry/types";
import type { UnmetNeedItem, UnmetNeedRemediation } from "./types";
import { loadUnmetNeedsDoc, saveUnmetNeedsDoc } from "./persist";

function guessRemediation(event: ToolTelemetryEvent): UnmetNeedRemediation {
  if (!event.ok) {
    if (event.errorCode === "permission_denied" || event.errorCode === "permission_denied_projects") {
      return "prompt_only";
    }
    if (event.source === "parse" || event.source === "lexical") {
      return "prompt_only";
    }
  }
  return "investigate";
}

export function createUnmetNeedFromTelemetryEvent(
  event: ToolTelemetryEvent,
  args: {
    title?: string;
    userPromptExcerpt?: string;
    remediation?: UnmetNeedRemediation;
    notes?: string;
    relatedProjectId?: string;
  } = {}
): UnmetNeedItem {
  const now = Date.now();
  const title =
    args.title?.trim() ||
    `Capability gap: ${event.toolId}${event.ok ? " (tool succeeded; outcome may still be wrong)" : ` (${event.errorCode ?? "failed"})`}`;
  const item: UnmetNeedItem = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    title,
    userPromptExcerpt: args.userPromptExcerpt?.trim() || undefined,
    userMessageId: event.userMessageId,
    relatedProjectId: args.relatedProjectId?.trim() || undefined,
    status: "open",
    remediation: args.remediation ?? guessRemediation(event),
    notes: args.notes?.trim() || undefined,
    linkedTelemetryEventIds: [event.id],
  };
  const doc = loadUnmetNeedsDoc();
  doc.items = [item, ...doc.items];
  saveUnmetNeedsDoc(doc);
  return item;
}

export function addUnmetNeed(item: Omit<UnmetNeedItem, "id" | "createdAt" | "updatedAt"> & { id?: string }): UnmetNeedItem {
  const now = Date.now();
  const full: UnmetNeedItem = {
    id: item.id ?? crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    title: item.title,
    userPromptExcerpt: item.userPromptExcerpt,
    userMessageId: item.userMessageId,
    relatedProjectId: item.relatedProjectId,
    status: item.status,
    remediation: item.remediation,
    notes: item.notes,
    linkedTelemetryEventIds: [...item.linkedTelemetryEventIds],
  };
  const doc = loadUnmetNeedsDoc();
  doc.items = [full, ...doc.items];
  saveUnmetNeedsDoc(doc);
  return full;
}

export function updateUnmetNeed(
  id: string,
  patch: Partial<
    Pick<
      UnmetNeedItem,
      | "title"
      | "userPromptExcerpt"
      | "userMessageId"
      | "relatedProjectId"
      | "status"
      | "remediation"
      | "notes"
      | "linkedTelemetryEventIds"
    >
  >
): void {
  const doc = loadUnmetNeedsDoc();
  const i = doc.items.findIndex((x) => x.id === id);
  if (i < 0) return;
  const cur = doc.items[i]!;
  doc.items[i] = {
    ...cur,
    ...patch,
    linkedTelemetryEventIds:
      patch.linkedTelemetryEventIds ?? cur.linkedTelemetryEventIds,
    updatedAt: Date.now(),
  };
  saveUnmetNeedsDoc(doc);
}

export function deleteUnmetNeed(id: string): void {
  const doc = loadUnmetNeedsDoc();
  doc.items = doc.items.filter((x) => x.id !== id);
  saveUnmetNeedsDoc(doc);
}

export function listUnmetNeeds(): UnmetNeedItem[] {
  return loadUnmetNeedsDoc().items;
}
