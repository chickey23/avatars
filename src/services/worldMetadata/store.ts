import type { PersonMetadataRecord, WorldMetadataDoc } from "./types";
import { createEmptyWorldMetadataDoc } from "./types";
import {
  LocalStorageWorldMetadataBackend,
  readWorldMetadataFromLocalStorageSync,
  type WorldMetadataBackend,
} from "./backend";

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

function flushPersist(): void {
  persistTimer = null;
  void defaultBackend.write(doc);
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
