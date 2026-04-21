import {
  WAVES_QUEUE_SCHEMA_VERSION,
  createEmptyWavesQueueDoc,
  type WavesQueueDoc,
} from "./types";

export const WAVES_QUEUE_STORAGE_KEY = "avatars_switchboard_waves_queue_v1";

/** Exported for tests: upgrades persisted v1 docs to current schema without wiping entries. */
export function migrateWavesQueueDoc(raw: unknown): WavesQueueDoc {
  if (!raw || typeof raw !== "object") return createEmptyWavesQueueDoc();
  const o = raw as Record<string, unknown>;
  const v = o.schemaVersion;
  const entries = o.entries;
  if (!Array.isArray(entries)) return createEmptyWavesQueueDoc();

  if (v === 1) {
    return {
      schemaVersion: WAVES_QUEUE_SCHEMA_VERSION,
      entries: entries as WavesQueueDoc["entries"],
    };
  }
  if (v !== WAVES_QUEUE_SCHEMA_VERSION) return createEmptyWavesQueueDoc();
  return {
    schemaVersion: WAVES_QUEUE_SCHEMA_VERSION,
    entries: entries as WavesQueueDoc["entries"],
  };
}

export function loadWavesQueueFromStorage(): WavesQueueDoc {
  try {
    const raw = localStorage.getItem(WAVES_QUEUE_STORAGE_KEY);
    if (!raw) return createEmptyWavesQueueDoc();
    return migrateWavesQueueDoc(JSON.parse(raw));
  } catch {
    return createEmptyWavesQueueDoc();
  }
}

export function saveWavesQueueToStorage(doc: WavesQueueDoc): void {
  try {
    localStorage.setItem(
      WAVES_QUEUE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: doc.schemaVersion,
        entries: doc.entries,
      })
    );
  } catch {
    /* quota */
  }
}
