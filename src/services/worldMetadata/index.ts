export type {
  CuratedAssertionRecord,
  DiscoverySourceKind,
  KnowledgeDiscoveryRunRecord,
  KnowledgeSetMemberCandidateRecord,
  KnowledgeSetMemberCandidateStatus,
  KnowledgeSetMemberRecord,
  KnowledgeSetRecord,
  PersonMetadataRecord,
  ProjectMetadataRecord,
  UserProfilePatchPendingRecord,
  UserProfileRecord,
  WorldMetadataDoc,
  WorldMetadataSchemaVersion,
} from "./types";
export { WORLD_METADATA_SCHEMA_VERSION, createEmptyWorldMetadataDoc } from "./types";
export type { WorldMetadataBackend } from "./backend";
export {
  LocalStorageWorldMetadataBackend,
  WORLD_METADATA_STORAGE_KEY,
  migrateWorldMetadataDoc,
  readWorldMetadataFromLocalStorageSync,
} from "./backend";
export {
  ensureWorldMetadataLoaded,
  hydrateWorldMetadataFromDisk,
  getWorldMetadata,
  patchWorldMetadata,
  patchWorldMetadataProjects,
  patchUserProfile,
  patchKnowledgeSets,
  replaceUserProfile,
  pruneWorldMetadataPlaceholderProjects,
  applyPendingUserProfilePatch,
  clearPendingUserProfilePatch,
  patchCuratedAssertions,
  seedCuratedAssertionsIntoWorldMetadata,
  seedProjectsIntoWorldMetadata,
  schedulePersistWorldMetadata,
  setPendingUserProfilePatch,
  upsertCuratedAssertion,
  getContactOverlayById,
} from "./store";
export { isPlaceholderProjectTitle } from "./titleSanity";
export { projectMetadataDetailLines } from "./relevance";
export {
  userProfileToRelevanceLines,
  USER_PROFILE_RELEVANCE_PREFIX,
} from "./userProfileRelevance";
