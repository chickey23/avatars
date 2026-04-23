/** localStorage keys and layout limits for the main app chrome (visualizer columns, user color). */

export const SWITCHBOARD_VIZ_STORAGE_KEY = "avatars_switchboard_viz_enabled";
export const CHAT_VIZ_WIDTH_STORAGE_KEY = "avatars_chat_visualizer_width_px";
export const CHAT_VIZ_WIDTH_MIN = 8;
export const CHAT_VIZ_WIDTH_MAX = 320;
export const CHAT_VIZ_WIDTH_DEFAULT = 120;
export const SOURCE_CACHE_VIZ_STORAGE_KEY = "avatars_source_cache_viz_enabled";
export const SOURCE_CACHE_VIZ_WIDTH_STORAGE_KEY =
  "avatars_source_cache_viz_width_px";
export const USER_CHROME_STORAGE_KEY = "avatars_user_chrome_color";
export const USER_CHROME_DEFAULT = "#0f3460";

export const FUTURE_SOURCE_COLUMNS = [
  { id: "reddit", label: "Reddit" },
  { id: "hotmail", label: "Hotmail / Outlook" },
  { id: "youtube", label: "YouTube (now playing / recent)" },
  { id: "steam", label: "Steam" },
] as const;
