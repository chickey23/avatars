import type { ToolWorkshopSettings } from "./types";

export const TOOL_WORKSHOP_STORAGE_KEY = "avatars_tool_workshop_v1";

export const DEFAULT_TOOL_WORKSHOP_SETTINGS: ToolWorkshopSettings = {
  maxActiveAddenda: 8,
  maxAddendumItemChars: 400,
  refinerIntervalHours: 24,
  refinerFailureDeltaThreshold: 5,
  refinerAutoEnabled: false,
};

/** Merge order: permission guidance first in prompt. */
export const ADDENDUM_CATEGORY_ORDER: import("./types").ToolWorkshopAddendumCategory[] =
  ["permission", "schema", "fetch_allowlist", "lexical", "parse", "other"];
