/** World metadata document — local-only accumulated facts (v1 JSON). */

export const WORLD_METADATA_SCHEMA_VERSION = 1 as const;

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
  notes?: string;
  updatedAt: number;
};

export type WorldMetadataDoc = {
  schemaVersion: WorldMetadataSchemaVersion;
  people: Record<string, PersonMetadataRecord>;
  projects: Record<string, ProjectMetadataRecord>;
};

export function createEmptyWorldMetadataDoc(): WorldMetadataDoc {
  return {
    schemaVersion: WORLD_METADATA_SCHEMA_VERSION,
    people: {},
    projects: {},
  };
}
