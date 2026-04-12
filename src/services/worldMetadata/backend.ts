import type { WorldMetadataDoc } from "./types";
import {
  WORLD_METADATA_SCHEMA_VERSION,
  createEmptyWorldMetadataDoc,
} from "./types";

export type WorldMetadataBackend = {
  read(): Promise<WorldMetadataDoc>;
  write(doc: WorldMetadataDoc): Promise<void>;
};

export const WORLD_METADATA_STORAGE_KEY = "avatars_world_metadata_v1";

/** Normalize persisted JSON; preserves schema v1 documents without `projects`. */
export function migrateWorldMetadataDoc(raw: unknown): WorldMetadataDoc {
  if (!raw || typeof raw !== "object") return createEmptyWorldMetadataDoc();
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== WORLD_METADATA_SCHEMA_VERSION) {
    return createEmptyWorldMetadataDoc();
  }
  const people = o.people;
  if (!people || typeof people !== "object") {
    return createEmptyWorldMetadataDoc();
  }
  const projectsRaw = o.projects;
  const projects =
    projectsRaw && typeof projectsRaw === "object"
      ? (projectsRaw as WorldMetadataDoc["projects"])
      : {};
  return {
    schemaVersion: WORLD_METADATA_SCHEMA_VERSION,
    people: people as WorldMetadataDoc["people"],
    projects,
  };
}

/** Synchronous read for startup paths (localStorage only). */
export function readWorldMetadataFromLocalStorageSync(): WorldMetadataDoc {
  try {
    const raw = localStorage.getItem(WORLD_METADATA_STORAGE_KEY);
    if (!raw) return createEmptyWorldMetadataDoc();
    return migrateWorldMetadataDoc(JSON.parse(raw));
  } catch {
    return createEmptyWorldMetadataDoc();
  }
}

/** v1: browser localStorage. Replace with Tauri disk or SQLite behind this interface when needed. */
export class LocalStorageWorldMetadataBackend implements WorldMetadataBackend {
  async read(): Promise<WorldMetadataDoc> {
    return readWorldMetadataFromLocalStorageSync();
  }

  async write(doc: WorldMetadataDoc): Promise<void> {
    const payload = JSON.stringify({
      ...doc,
      schemaVersion: WORLD_METADATA_SCHEMA_VERSION,
    });
    localStorage.setItem(WORLD_METADATA_STORAGE_KEY, payload);
  }
}

/**
 * Future: read/write `world_metadata.json` under app data via Tauri invoke.
 * export class TauriFileWorldMetadataBackend implements WorldMetadataBackend { ... }
 */
