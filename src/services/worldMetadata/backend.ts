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

/** Normalize persisted JSON; migrates v1 to v2 (adds `userProfile`). */
export function migrateWorldMetadataDoc(raw: unknown): WorldMetadataDoc {
  if (!raw || typeof raw !== "object") return createEmptyWorldMetadataDoc();
  const o = raw as Record<string, unknown>;
  const sv = o.schemaVersion;
  if (sv !== 1 && sv !== WORLD_METADATA_SCHEMA_VERSION) {
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
  const upRaw = o.userProfile;
  let userProfile: WorldMetadataDoc["userProfile"];
  if (upRaw && typeof upRaw === "object") {
    const u = upRaw as Record<string, unknown>;
    userProfile = {
      displayName:
        typeof u.displayName === "string" ? u.displayName : undefined,
      pronouns: typeof u.pronouns === "string" ? u.pronouns : undefined,
      notes: typeof u.notes === "string" ? u.notes : undefined,
      updatedAt:
        typeof u.updatedAt === "number" ? u.updatedAt : Date.now(),
    };
  } else {
    userProfile = { updatedAt: Date.now() };
  }
  return {
    schemaVersion: WORLD_METADATA_SCHEMA_VERSION,
    people: people as WorldMetadataDoc["people"],
    projects,
    userProfile,
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

export function worldMetadataDocHasContent(d: WorldMetadataDoc): boolean {
  const hasUser =
    Boolean(d.userProfile.displayName?.trim()) ||
    Boolean(d.userProfile.pronouns?.trim()) ||
    Boolean(d.userProfile.notes?.trim());
  return (
    Object.keys(d.people).length > 0 ||
    Object.keys(d.projects).length > 0 ||
    hasUser
  );
}

export function mirrorWorldMetadataToLocalStorage(doc: WorldMetadataDoc): void {
  try {
    localStorage.setItem(
      WORLD_METADATA_STORAGE_KEY,
      JSON.stringify({
        ...doc,
        schemaVersion: WORLD_METADATA_SCHEMA_VERSION,
      })
    );
  } catch {
    /* ignore */
  }
}
