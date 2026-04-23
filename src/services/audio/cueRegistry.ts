/**
 * Snippet keys for bundled voice clips and SFX resolution.
 * Phase 1: files under `public/audio/cues/<snippet>/<voiceProfileId>.opus`
 * (or .ogg). Missing files fall back to synthetic cues where applicable.
 */

import type { Avatar } from "../../types";

export const DEFAULT_VOICE_PROFILE_ID = "default";

/** Predefined one-shot voice / cue identifiers. */
export const AUDIO_SNIPPET_IDS = {
  bgRunnerPulse: "bg_runner_pulse",
  cacheRefresh: "cache_refresh",
  cacheTopChange: "cache_top_change",
  timerDue: "timer_due",
  schedulerBlip: "scheduler_blip",
  waveSettled: "wave_settled",
} as const;

export type AudioSnippetId =
  (typeof AUDIO_SNIPPET_IDS)[keyof typeof AUDIO_SNIPPET_IDS];

const SNIPPET_IDS = new Set<string>(Object.values(AUDIO_SNIPPET_IDS));

export function isAudioSnippetId(s: string): s is AudioSnippetId {
  return SNIPPET_IDS.has(s);
}

function audioBasePath(): string {
  const base = import.meta.env.BASE_URL;
  return base.endsWith("/") ? base : `${base}/`;
}

/**
 * Public URL for a bundled cue clip (Opus or Ogg).
 * Try `.opus` first at runtime via fetch order in audioDirector, or standardize on one extension.
 */
export function resolveCueClipUrl(
  snippetId: AudioSnippetId,
  voiceProfileId: string,
  ext: "opus" | "ogg" | "wav" = "opus"
): string {
  const safeProfile = encodeURIComponent(voiceProfileId);
  return `${audioBasePath()}audio/cues/${snippetId}/${safeProfile}.${ext}`;
}

/** Alternate extensions if primary fetch 404s (tried in order by audioDirector). */
export function resolveCueClipUrlAlternates(
  snippetId: AudioSnippetId,
  voiceProfileId: string
): string[] {
  return [
    resolveCueClipUrl(snippetId, voiceProfileId, "ogg"),
    resolveCueClipUrl(snippetId, voiceProfileId, "wav"),
  ];
}

export function resolveSoundscapeUrl(
  presetId: string,
  ext: "opus" | "ogg" | "wav" = "opus"
): string {
  const id = encodeURIComponent(presetId);
  return `${audioBasePath()}audio/soundscape/${id}.${ext}`;
}

export function resolveSoundscapeUrlAlternates(presetId: string): string[] {
  return [
    resolveSoundscapeUrl(presetId, "ogg"),
    resolveSoundscapeUrl(presetId, "wav"),
  ];
}

/** Effective voice profile for an avatar (for per-avatar queues). */
export function voiceProfileIdForAvatar(avatar: Avatar | undefined): string {
  const v = avatar?.appearance?.voiceProfileId;
  if (typeof v === "string" && v.trim()) return v.trim();
  return DEFAULT_VOICE_PROFILE_ID;
}
