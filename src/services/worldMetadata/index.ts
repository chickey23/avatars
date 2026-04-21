export type {
  PersonMetadataRecord,
  ProjectMetadataRecord,
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
  replaceUserProfile,
  schedulePersistWorldMetadata,
  getContactOverlayById,
} from "./store";
export { projectMetadataDetailLines } from "./relevance";
export {
  userProfileToRelevanceLines,
  USER_PROFILE_RELEVANCE_PREFIX,
} from "./userProfileRelevance";
