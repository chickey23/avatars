/** World metadata document — local-only accumulated facts (v1 JSON). */

export const WORLD_METADATA_SCHEMA_VERSION = 4 as const;

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

/** Curated worldview assertion (object + claim + provenance). */
export type CuratedAssertionRecord = {
  id: string;
  object: string;
  assertion: string;
  /** 0 (unknown) .. 1 (certain); writers should clamp. */
  certainty: number;
  source: string;
  updatedAt: number;
};

/** Proposal awaiting user Apply/Discard in chat (at most one slot). */
export type UserProfilePatchPendingRecord = {
  id: string;
  patch: {
    displayName?: string;
    pronouns?: string;
    notes?: string;
  };
  requestedByAvatarId: string;
  userMessageId: string;
  createdAt: number;
};

/** Shared-shape cast / set data from read-only public sources (e.g. Wikidata). */
export type KnowledgeSetMemberRecord = {
  name: string;
  qid?: string;
  actor?: string;
  actorQid?: string;
  descriptors: string[];
};

/** How names in this discovery run were produced (for effectiveness / reprioritization). */
export type DiscoverySourceKind =
  | "wikidata_auto"
  | "wikidata_work_pick"
  | "legacy_web"
  | "ollama";

/** One discovery pass (Wikidata try, legacy SERP, etc.) appended for audit and merge. */
export type KnowledgeDiscoveryRunRecord = {
  runId: string;
  at: number;
  query: string;
  notices: string[];
  sourceLines: string[];
  extractedNames: string[];
  workQid?: string;
  workLabel?: string;
  /** Cheap hints: parent set, pantheon, franchise, instance-of style strings. */
  relatedSetHints?: string[];
  sourceKind?: DiscoverySourceKind;
  /** Count of member candidates moved to task_spawned credited to this run (primary contributor). */
  acceptedMemberCount?: number;
};

export type KnowledgeSetMemberCandidateStatus =
  | "suggested"
  | "skipped"
  | "task_spawned"
  | "avatar_created";

export type KnowledgeSetMemberCandidateRecord = {
  /** Canonical display string (first-seen casing). */
  displayName: string;
  normalizedKey: string;
  status: KnowledgeSetMemberCandidateStatus;
  qid?: string;
  descriptors: string[];
  seenInRunIds: string[];
};

export type KnowledgeSetRecord = {
  setKey: string;
  label: string;
  members: KnowledgeSetMemberRecord[];
  sourceQid?: string;
  fetchedAt: number;
  provenance: string[];
  /** Optional tags for set composition / entity class (downstream disambiguation). */
  setCompositionTags?: string[];
  /** Wikidata work QIDs (normalized `Q…`) that returned no usable cast for this set; omitted from future work-pick buttons. */
  excludedWikidataWorkQids?: string[];
  /** Incremental discovery evidence (schema v3+ optional). */
  discoveryRuns?: KnowledgeDiscoveryRunRecord[];
  /** Candidate roster merged across runs; keyed by normalized name. */
  memberCandidates?: Record<string, KnowledgeSetMemberCandidateRecord>;
};

export type WorldMetadataDoc = {
  schemaVersion: WorldMetadataSchemaVersion;
  people: Record<string, PersonMetadataRecord>;
  projects: Record<string, ProjectMetadataRecord>;
  /** Local user identity for addressing and context (schema v2+). */
  userProfile: UserProfileRecord;
  /** Structured sets keyed by discovery slug (schema v3+). */
  knowledgeSets?: Record<string, KnowledgeSetRecord>;
  /** Curated assertions (schema v4+). */
  curatedAssertions?: Record<string, CuratedAssertionRecord>;
  /** Avatar-proposed user profile patch awaiting chat confirmation. */
  pendingUserProfilePatch?: UserProfilePatchPendingRecord | null;
};

export function createEmptyWorldMetadataDoc(): WorldMetadataDoc {
  const now = Date.now();
  return {
    schemaVersion: WORLD_METADATA_SCHEMA_VERSION,
    people: {},
    projects: {},
    userProfile: { updatedAt: now },
    knowledgeSets: {},
    curatedAssertions: {},
    pendingUserProfilePatch: null,
  };
}
