import type { UnmetNeedsDoc } from "./types";
import { UNMET_NEEDS_SCHEMA_VERSION } from "./types";
import { UNMET_NEEDS_STORAGE_KEY } from "./constants";

export function createEmptyUnmetNeedsDoc(): UnmetNeedsDoc {
  return { schemaVersion: UNMET_NEEDS_SCHEMA_VERSION, items: [] };
}

export function migrateUnmetNeedsDoc(raw: unknown): UnmetNeedsDoc {
  if (!raw || typeof raw !== "object") return createEmptyUnmetNeedsDoc();
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== UNMET_NEEDS_SCHEMA_VERSION || !Array.isArray(o.items)) {
    return createEmptyUnmetNeedsDoc();
  }
  return o as UnmetNeedsDoc;
}

export function loadUnmetNeedsDoc(): UnmetNeedsDoc {
  try {
    const raw = localStorage.getItem(UNMET_NEEDS_STORAGE_KEY);
    if (!raw) return createEmptyUnmetNeedsDoc();
    return migrateUnmetNeedsDoc(JSON.parse(raw));
  } catch {
    return createEmptyUnmetNeedsDoc();
  }
}

export function saveUnmetNeedsDoc(doc: UnmetNeedsDoc): void {
  try {
    localStorage.setItem(
      UNMET_NEEDS_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: doc.schemaVersion,
        items: doc.items,
      })
    );
  } catch {
    /* quota */
  }
}
