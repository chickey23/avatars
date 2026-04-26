import type {
  ToolTelemetryDoc,
  ToolTelemetryEvent,
  ToolTelemetryAggregateRow,
  ToolIntentCorrectnessSummary,
  ToolIntentCorrectnessByAvatarRow,
} from "./types";
import { TOOL_TELEMETRY_SCHEMA_VERSION } from "./types";
import {
  TOOL_TELEMETRY_MAX_EVENTS,
  TOOL_TELEMETRY_STORAGE_KEY,
} from "./constants";

function isPermissionErrorCode(code: string | undefined): boolean {
  if (!code) return false;
  return (
    code === "permission_denied" ||
    code === "permission_denied_projects" ||
    code.startsWith("permission_denied")
  );
}

export function createEmptyTelemetryDoc(): ToolTelemetryDoc {
  return { schemaVersion: TOOL_TELEMETRY_SCHEMA_VERSION, events: [] };
}

export function migrateTelemetryDoc(raw: unknown): ToolTelemetryDoc {
  if (!raw || typeof raw !== "object") return createEmptyTelemetryDoc();
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== TOOL_TELEMETRY_SCHEMA_VERSION || !Array.isArray(o.events)) {
    return createEmptyTelemetryDoc();
  }
  return o as ToolTelemetryDoc;
}

export function loadToolTelemetryFromStorage(): ToolTelemetryDoc {
  try {
    const raw = localStorage.getItem(TOOL_TELEMETRY_STORAGE_KEY);
    if (!raw) return createEmptyTelemetryDoc();
    return migrateTelemetryDoc(JSON.parse(raw));
  } catch {
    return createEmptyTelemetryDoc();
  }
}

export function saveToolTelemetryToStorage(doc: ToolTelemetryDoc): void {
  try {
    localStorage.setItem(
      TOOL_TELEMETRY_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: doc.schemaVersion,
        events: doc.events,
      })
    );
  } catch {
    /* quota */
  }
}

function trimEvents(events: ToolTelemetryEvent[]): ToolTelemetryEvent[] {
  if (events.length <= TOOL_TELEMETRY_MAX_EVENTS) return events;
  return events.slice(events.length - TOOL_TELEMETRY_MAX_EVENTS);
}

/**
 * Append one telemetry event and persist. Call from runAvatarAgent only (single choke point).
 */
export function appendToolTelemetryEvent(
  event: Omit<ToolTelemetryEvent, "id" | "at" | "isPermissionError"> & {
    isPermissionError?: boolean;
  }
): void {
  const doc = loadToolTelemetryFromStorage();
  const row: ToolTelemetryEvent = {
    ...event,
    id: crypto.randomUUID(),
    at: Date.now(),
    isPermissionError:
      event.isPermissionError ?? isPermissionErrorCode(event.errorCode),
  };
  doc.events = trimEvents([...doc.events, row]);
  saveToolTelemetryToStorage(doc);
}

/** Build aggregate rows for workshop / refiner (derived, not stored). */
export function computeToolTelemetryAggregates(
  events: ToolTelemetryEvent[]
): ToolTelemetryAggregateRow[] {
  const map = new Map<string, ToolTelemetryAggregateRow>();

  for (const e of events) {
    const bucket = e.ok ? "ok" : (e.errorCode ?? "failed");
    const key = `${e.avatarId}\0${e.toolId}\0${bucket}`;
    let row = map.get(key);
    if (!row) {
      row = {
        toolId: e.toolId,
        avatarId: e.avatarId,
        errorCode: e.ok ? null : (e.errorCode ?? "failed"),
        successCount: 0,
        failureCount: 0,
        lastEventAt: undefined,
        lastSuccessAt: undefined,
        lastFailureAt: undefined,
      };
      map.set(key, row);
    }
    row.lastEventAt = Math.max(row.lastEventAt ?? 0, e.at);
    if (e.ok) {
      row.successCount++;
      row.lastSuccessAt = Math.max(row.lastSuccessAt ?? 0, e.at);
    } else {
      row.failureCount++;
      row.lastFailureAt = Math.max(row.lastFailureAt ?? 0, e.at);
    }
  }

  const sortedNewestFirst = [...events].sort((a, b) => b.at - a.at);
  for (const e of sortedNewestFirst) {
    const bucket = e.ok ? "ok" : (e.errorCode ?? "failed");
    const key = `${e.avatarId}\0${e.toolId}\0${bucket}`;
    const row = map.get(key);
    if (!row || row.lastResultPreview) continue;
    const preview = (e.resultPreview ?? e.argsPreview)?.trim();
    if (preview) {
      row.lastResultPreview =
        preview.length > 280 ? `${preview.slice(0, 279)}…` : preview;
    }
  }

  return [...map.values()];
}

/**
 * Success events that recorded `correctToolForIntent` (turn had a non-none intent).
 */
export function computeToolIntentCorrectness(
  events: ToolTelemetryEvent[]
): ToolIntentCorrectnessSummary {
  let correct = 0;
  let total = 0;
  for (const e of events) {
    if (!e.ok || e.correctToolForIntent === undefined) continue;
    total++;
    if (e.correctToolForIntent) correct++;
  }
  return { correct, total };
}

/**
 * Same as {@link computeToolIntentCorrectness} but grouped by avatar (for workshop UI).
 */
export function computeToolIntentCorrectnessByAvatar(
  events: ToolTelemetryEvent[]
): ToolIntentCorrectnessByAvatarRow[] {
  const map = new Map<string, { correct: number; total: number }>();
  for (const e of events) {
    if (!e.ok || e.correctToolForIntent === undefined) continue;
    const row = map.get(e.avatarId) ?? { correct: 0, total: 0 };
    row.total++;
    if (e.correctToolForIntent) row.correct++;
    map.set(e.avatarId, row);
  }
  return [...map.entries()]
    .map(([avatarId, v]) => ({
      avatarId,
      correct: v.correct,
      total: v.total,
    }))
    .sort((a, b) => b.total - a.total);
}

/** Sort events for workshop: newest first. */
export function sortToolTelemetryEventsForDisplay(
  events: ToolTelemetryEvent[]
): ToolTelemetryEvent[] {
  return [...events].sort((a, b) => b.at - a.at);
}

export { isPermissionErrorCode };
