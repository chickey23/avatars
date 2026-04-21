/** World metadata document — local-only accumulated facts (v1 JSON). */

export const WORLD_METADATA_SCHEMA_VERSION = 2 as const;

export type WorldMetadataSchemaVersion = typeof WORLD_METADATA_SCHEMA_VERSION;

/** Per-person overlay keyed by connector contact id */
export type PersonMetadataRecord = {
  userTags?: string[];
  relationshipNote?: string;
  notes?: string;
  updatedAt: number;
};

/** User-defined project (shared metadata; execution / agents later). */
export type ProjectMetadataRecord = {
  title: string;
  /** Short prompt-oriented summary (optional). */
  summary?: string;
  notes?: string;
  updatedAt: number;
};

/** Singleton profile for the human user (prompts + world model). */
export type UserProfileRecord = {
  displayName?: string;
  pronouns?: string;
  notes?: string;
  updatedAt: number;
};

export type WorldMetadataDoc = {
  schemaVersion: WorldMetadataSchemaVersion;
  people: Record<string, PersonMetadataRecord>;
  projects: Record<string, ProjectMetadataRecord>;
  /** Local user identity for addressing and context (schema v2+). */
  userProfile: UserProfileRecord;
};

export function createEmptyWorldMetadataDoc(): WorldMetadataDoc {
  const now = Date.now();
  return {
    schemaVersion: WORLD_METADATA_SCHEMA_VERSION,
    people: {},
    projects: {},
    userProfile: { updatedAt: now },
  };
}
