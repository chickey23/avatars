import type { ChatWindowStyleId } from "../theme/designTokens";

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
export const USER_CHROME_BY_SKIN_STORAGE_KEY =
  "avatars_user_chrome_color_by_skin";
export const USER_CHROME_DEFAULT = "#0f3460";

const USER_CHROME_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export type UserChromeColorBySkin = Partial<Record<ChatWindowStyleId, string>>;

export function isValidUserChromeColor(value: unknown): value is string {
  return typeof value === "string" && USER_CHROME_COLOR_RE.test(value);
}

export function readUserChromeColorBySkin(
  storage: Pick<Storage, "getItem">
): UserChromeColorBySkin {
  const next: UserChromeColorBySkin = {};
  try {
    const raw = storage.getItem(USER_CHROME_BY_SKIN_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      for (const [skin, color] of Object.entries(parsed)) {
        if (isValidUserChromeColor(color)) {
          next[skin as ChatWindowStyleId] = color;
        }
      }
    }
    const legacy = storage.getItem(USER_CHROME_STORAGE_KEY);
    if (isValidUserChromeColor(legacy) && !next.default) {
      next.default = legacy;
    }
  } catch {
    /* ignore malformed storage */
  }
  return next;
}

export function resolveUserChromeColorForSkin(
  colors: UserChromeColorBySkin,
  skin: ChatWindowStyleId
): string {
  return colors[skin] ?? colors.default ?? USER_CHROME_DEFAULT;
}

export function serializeUserChromeColorBySkin(
  colors: UserChromeColorBySkin
): string {
  const clean: UserChromeColorBySkin = {};
  for (const [skin, color] of Object.entries(colors)) {
    if (isValidUserChromeColor(color)) {
      clean[skin as ChatWindowStyleId] = color;
    }
  }
  return JSON.stringify(clean);
}

export const FUTURE_SOURCE_COLUMNS = [
  { id: "reddit", label: "Reddit" },
  { id: "hotmail", label: "Hotmail / Outlook" },
  { id: "youtube", label: "YouTube (now playing / recent)" },
  { id: "steam", label: "Steam" },
] as const;
