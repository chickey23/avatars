import type { Avatar } from "../types";

/**
 * Matches chat message block accents (see App.css `.message-block-avatar[data-avatar-id]`).
 * Built-in primary avatars use frame/border colors that differ from `appearance.accentColor`.
 */
const BUILTIN_VIZ_COLOR: Record<string, string> = {
  muse: "rgba(255, 255, 255, 0.9)",
  accomplice: "#e94560",
  skeptic: "#111111",
};

const FALLBACK = "rgba(120, 120, 140, 0.65)";

/**
 * Color for Chat Visualizer dots and other chrome that should match in-thread avatar styling.
 */
export function getAvatarVizColor(
  avatarId: string,
  lookup: (id: string) => Avatar | undefined
): string {
  const builtIn = BUILTIN_VIZ_COLOR[avatarId];
  if (builtIn) return builtIn;
  const a = lookup(avatarId);
  return a?.appearance?.accentColor ?? FALLBACK;
}
