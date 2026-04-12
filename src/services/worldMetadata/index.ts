export type {
  PersonMetadataRecord,
  ProjectMetadataRecord,
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
  getWorldMetadata,
  patchWorldMetadata,
  patchWorldMetadataProjects,
  schedulePersistWorldMetadata,
  getContactOverlayById,
} from "./store";
