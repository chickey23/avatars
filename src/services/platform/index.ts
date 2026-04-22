/**
 * Platform — single entry for durable app state, background runners, scheduler, bus.
 */

export {
  PLATFORM_ATTRIBUTION_AVATAR_ID,
  PLATFORM_ATTRIBUTION_ACCENT_COLOR,
  PLATFORM_LOG_CATEGORY,
  PLATFORM_CACHE_FILES,
  PLATFORM_CACHE_STORAGE_KEYS,
  PLATFORM_CACHE_SCHEMA_VERSION,
  PLATFORM_RUNNER_INTERVAL_MS,
  PLATFORM_RUNNER_MIN_GAP_MS,
  PLATFORM_SCHEDULER_INTERVAL_MS,
  PLATFORM_STORE_FILE,
  PLATFORM_STORE_STORAGE_KEY,
  PLATFORM_STORE_SCHEMA_VERSION,
} from "./constants";
export {
  isPlatformAttributionAvatarId,
  isSystemAvatarId,
  filterOutSystemAvatars,
  findPlatformAttributionInCatalog,
  resolvePlatformAttributionFromCatalog,
  setRoutingCatalogRef,
  getRoutingCatalogRef,
} from "./routing";
export { platformLog } from "./platformLog";
export type { PlatformLogEvent } from "./platformLog";
export {
  readSourceCache,
  readSourceCacheSync,
  writeSourceCache,
  hashItemIds,
  describeStaleness,
} from "./sourceCache";
export type {
  SourceCacheKind,
  SourceCacheSnapshot,
  SourceCacheItems,
  SourceCacheStaleness,
  WriteSourceCacheArgs,
} from "./sourceCache";
export {
  subscribePlatformEvents,
  publishPlatformEvent,
  diffTopK,
} from "./bus";
export type { PlatformBusEvent } from "./bus";
export { startPlatformRunners } from "./runners";
export type {
  PlatformRunnerBundle,
  StartPlatformRunnersOptions,
} from "./runners";
export { gatherDataFromCacheFirst } from "./cachedSources";
export { platformFocusedProjectBlock } from "./projectBlock";
export {
  ensurePlatformStoreLoadedSync,
  ensurePlatformStoreLoadedAsync,
  getPlatformStore,
  subscribePlatformStore,
  upsertProject,
  upsertTask,
  deleteProject,
  deleteTask,
  migrateProjectsFromWorldMetadata,
  syncWorldMetadataProjectsAdditive,
  prunePlatformPlaceholderProjects,
  createEmptyPlatformStoreDoc,
  __resetPlatformStoreForTests,
} from "./store";
export { startPlatformScheduler } from "./scheduler";
export {
  ensurePlatformDraftsLoadedSync,
  ensurePlatformDraftsLoadedAsync,
  getPlatformDrafts,
  subscribePlatformDrafts,
  recordDraft,
  setDraftStatus,
  createEmptyPlatformDraftsDoc,
  __resetPlatformDraftsForTests,
} from "./drafts";
export type {
  PlatformDraftKind,
  PlatformDraftStatus,
  PlatformDraftRecord,
  PlatformDraftsDoc,
  PlatformDraftPayload,
  PlatformTaskDraftPayload,
  PlatformCalendarDraftPayload,
  PlatformEmailDraftPayload,
  RecordDraftInput,
} from "./drafts";
export type {
  SchedulerHandle,
  StartSchedulerOptions,
  SchedulerFireEvent,
  SchedulerFireReason,
} from "./scheduler";
export type {
  PlatformStoreDoc,
  PlatformProjectRecord,
  PlatformTaskRecord,
  PlatformProjectStatus,
  PlatformTaskStatus,
  PlatformHistoryEvent,
  PlatformHistoryKind,
  UpsertProjectInput,
  UpsertTaskInput,
  WorldProjectLike,
} from "./store";
