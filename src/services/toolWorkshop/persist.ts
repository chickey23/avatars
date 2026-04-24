import type { ToolWorkshopDoc, ToolWorkshopSettings } from "./types";
import { TOOL_WORKSHOP_SCHEMA_VERSION } from "./types";
import {
  DEFAULT_TOOL_WORKSHOP_SETTINGS,
  TOOL_WORKSHOP_STORAGE_KEY,
} from "./constants";

export function createEmptyToolWorkshopDoc(): ToolWorkshopDoc {
  return {
    schemaVersion: TOOL_WORKSHOP_SCHEMA_VERSION,
    settings: { ...DEFAULT_TOOL_WORKSHOP_SETTINGS },
    activeAddenda: [],
    pendingProposals: [],
  };
}

function migrateToolWorkshopDoc(raw: unknown): ToolWorkshopDoc {
  if (!raw || typeof raw !== "object") return createEmptyToolWorkshopDoc();
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== TOOL_WORKSHOP_SCHEMA_VERSION) {
    return createEmptyToolWorkshopDoc();
  }
  const settings = o.settings as ToolWorkshopSettings | undefined;
  const activeAddenda = o.activeAddenda;
  const pendingProposals = o.pendingProposals;
  if (!settings || !Array.isArray(activeAddenda) || !Array.isArray(pendingProposals)) {
    return createEmptyToolWorkshopDoc();
  }
  return {
    schemaVersion: TOOL_WORKSHOP_SCHEMA_VERSION,
    settings: { ...DEFAULT_TOOL_WORKSHOP_SETTINGS, ...settings },
    activeAddenda: activeAddenda as ToolWorkshopDoc["activeAddenda"],
    pendingProposals: pendingProposals as ToolWorkshopDoc["pendingProposals"],
    refinerSystemOverride:
      typeof o.refinerSystemOverride === "string"
        ? o.refinerSystemOverride
        : undefined,
    lastRefinerFailureSnapshot:
      typeof o.lastRefinerFailureSnapshot === "number"
        ? o.lastRefinerFailureSnapshot
        : undefined,
    lastAutoRefinementAt:
      typeof o.lastAutoRefinementAt === "number"
        ? o.lastAutoRefinementAt
        : undefined,
    lastRefinerAttemptAt:
      typeof o.lastRefinerAttemptAt === "number"
        ? o.lastRefinerAttemptAt
        : undefined,
  };
}

export function loadToolWorkshopDoc(): ToolWorkshopDoc {
  try {
    const raw = localStorage.getItem(TOOL_WORKSHOP_STORAGE_KEY);
    if (!raw) return createEmptyToolWorkshopDoc();
    return migrateToolWorkshopDoc(JSON.parse(raw));
  } catch {
    return createEmptyToolWorkshopDoc();
  }
}

export function saveToolWorkshopDoc(doc: ToolWorkshopDoc): void {
  try {
    localStorage.setItem(
      TOOL_WORKSHOP_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: doc.schemaVersion,
        settings: doc.settings,
        activeAddenda: doc.activeAddenda,
        pendingProposals: doc.pendingProposals,
        refinerSystemOverride: doc.refinerSystemOverride,
        lastRefinerFailureSnapshot: doc.lastRefinerFailureSnapshot,
        lastAutoRefinementAt: doc.lastAutoRefinementAt,
        lastRefinerAttemptAt: doc.lastRefinerAttemptAt,
      })
    );
  } catch {
    /* quota */
  }
}
