import type {
  PersonMetadataRecord,
  ProjectMetadataRecord,
  UserProfileRecord,
  WorldMetadataDoc,
} from "./types";
import { createEmptyWorldMetadataDoc } from "./types";
import {
  LocalStorageWorldMetadataBackend,
  migrateWorldMetadataDoc,
  mirrorWorldMetadataToLocalStorage,
  readWorldMetadataFromLocalStorageSync,
  worldMetadataDocHasContent,
  type WorldMetadataBackend,
} from "./backend";
import { WORLD_METADATA_SCHEMA_VERSION } from "./types";

let doc: WorldMetadataDoc = createEmptyWorldMetadataDoc();
let loaded = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const PERSIST_DEBOUNCE_MS = 120;

const defaultBackend: WorldMetadataBackend = new LocalStorageWorldMetadataBackend();

function mergePeoplePatch(
  people: WorldMetadataDoc["people"],
  patch: Partial<Record<string, Partial<PersonMetadataRecord> | null>>
): WorldMetadataDoc["people"] {
  const next = { ...people };
  const now = Date.now();
  for (const [id, rec] of Object.entries(patch)) {
    if (rec === null) {
      delete next[id];
      continue;
    }
    if (!rec) continue;
    const prev = next[id] ?? { updatedAt: now };
    next[id] = {
      ...prev,
      ...rec,
      updatedAt: now,
    };
  }
  return next;
}

function mergeProjectsPatch(
  projects: WorldMetadataDoc["projects"],
  patch: Partial<Record<string, Partial<ProjectMetadataRecord> | null>>
): WorldMetadataDoc["projects"] {
  const next = { ...projects };
  const now = Date.now();
  for (const [id, rec] of Object.entries(patch)) {
    if (rec === null) {
      delete next[id];
      continue;
    }
    if (!rec) continue;
    const prev = next[id];
    const title = (rec.title ?? prev?.title ?? "").trim();
    if (!title) continue;
    next[id] = {
      ...prev,
      ...rec,
      title,
      updatedAt: rec.updatedAt ?? now,
    };
  }
  return next;
}

/** Call once at app startup so in-memory doc matches disk before any user turn. */
export function ensureWorldMetadataLoaded(): void {
  if (loaded) return;
  doc = readWorldMetadataFromLocalStorageSync();
  loaded = true;
}

export function getWorldMetadata(): WorldMetadataDoc {
  ensureWorldMetadataLoaded();
  return doc;
}

/**
 * Merge person fields by contact id. Use `null` to remove a person record.
 * Updates memory immediately; persist is debounced.
 */
export function patchWorldMetadata(
  peoplePatch: Partial<Record<string, Partial<PersonMetadataRecord> | null>>
): WorldMetadataDoc {
  ensureWorldMetadataLoaded();
  doc = {
    ...doc,
    people: mergePeoplePatch(doc.people, peoplePatch),
  };
  schedulePersistWorldMetadata();
  return doc;
}

/**
 * Merge project fields by id. Use `null` to remove a project.
 * Updates memory immediately; persist is debounced.
 */
export function patchWorldMetadataProjects(
  projectPatch: Partial<Record<string, Partial<ProjectMetadataRecord> | null>>
): WorldMetadataDoc {
  ensureWorldMetadataLoaded();
  doc = {
    ...doc,
    projects: mergeProjectsPatch(doc.projects, projectPatch),
  };
  schedulePersistWorldMetadata();
  return doc;
}

/**
 * Replace the singleton user profile (merge partial fields into existing).
 */
export function patchUserProfile(
  patch: Partial<Omit<UserProfileRecord, "updatedAt">>
): WorldMetadataDoc {
  ensureWorldMetadataLoaded();
  const now = Date.now();
  const prev = doc.userProfile;
  doc = {
    ...doc,
    userProfile: {
      ...prev,
      ...patch,
      updatedAt: now,
    },
  };
  schedulePersistWorldMetadata();
  return doc;
}

/** Replace the singleton user profile (e.g. reverting a bad tool patch). */
export function replaceUserProfile(profile: UserProfileRecord): WorldMetadataDoc {
  ensureWorldMetadataLoaded();
  const now = Date.now();
  doc = {
    ...doc,
    userProfile: {
      ...profile,
      updatedAt: now,
    },
  };
  schedulePersistWorldMetadata();
  return doc;
}

function flushPersist(): void {
  persistTimer = null;
  void (async () => {
    const tauri =
      typeof window !== "undefined" && "__TAURI__" in window;
    if (tauri) {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("world_metadata_write", {
          payload: JSON.stringify({
            ...doc,
            schemaVersion: WORLD_METADATA_SCHEMA_VERSION,
          }),
        });
      } catch {
        /* disk write failed; still mirror LS */
      }
    }
    await defaultBackend.write(doc);
  })();
}

/**
 * Call once before UI (e.g. from `main.tsx`). On Tauri, prefers on-disk
 * `data/metadata/world_metadata.json`; migrates from localStorage when disk is empty.
 */
export async function hydrateWorldMetadataFromDisk(): Promise<void> {
  if (loaded) return;
  const tauri =
    typeof window !== "undefined" && "__TAURI__" in window;
  if (!tauri) {
    doc = readWorldMetadataFromLocalStorageSync();
    loaded = true;
    return;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const diskRaw = await invoke<string | null>("world_metadata_read");
    const fromLs = readWorldMetadataFromLocalStorageSync();
    if (diskRaw?.trim()) {
      doc = migrateWorldMetadataDoc(JSON.parse(diskRaw));
      mirrorWorldMetadataToLocalStorage(doc);
    } else if (worldMetadataDocHasContent(fromLs)) {
      doc = fromLs;
      await invoke("world_metadata_write", {
        payload: JSON.stringify({
          ...doc,
          schemaVersion: WORLD_METADATA_SCHEMA_VERSION,
        }),
      });
    } else {
      doc = fromLs;
    }
  } catch {
    doc = readWorldMetadataFromLocalStorageSync();
  }
  loaded = true;
}

/** Debounced full-document replace write so UI stays responsive. */
export function schedulePersistWorldMetadata(): void {
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(flushPersist, PERSIST_DEBOUNCE_MS);
}

/** Build overlap overlay strings for contact scoring (one string per contact id). */
export function getContactOverlayById(): Record<string, string> {
  ensureWorldMetadataLoaded();
  const out: Record<string, string> = {};
  for (const [id, p] of Object.entries(doc.people)) {
    const bits: string[] = [];
    if (p.userTags?.length) bits.push(p.userTags.join(" "));
    if (p.relationshipNote?.trim()) bits.push(p.relationshipNote.trim());
    if (p.notes?.trim()) bits.push(p.notes.trim());
    if (bits.length > 0) out[id] = bits.join(" ");
  }
  return out;
}
