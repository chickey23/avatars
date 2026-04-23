/**
 * Persisted global audio preferences (soundscape + cue levels).
 */

export const AUDIO_SETTINGS_STORAGE_KEY = "avatars_audio_v1";

export type AudioSettings = {
  masterVolume: number;
  ambienceVolume: number;
  cueVolume: number;
  voiceVolume: number;
  /** Preset id for looping soundscape, or null to disable. */
  soundscapePreset: string | null;
  /** Master kill switch (user can mute everything quickly). */
  enabled: boolean;
  /** When true, only soundscape plays; cues and voice snippets are suppressed. */
  focusMode: boolean;
  /** When true, skip nonessential platform cues if prefers-reduced-motion is reduce. */
  respectReducedMotion: boolean;
};

export const defaultAudioSettings: AudioSettings = {
  masterVolume: 0.85,
  ambienceVolume: 0.35,
  cueVolume: 0.45,
  voiceVolume: 0.7,
  soundscapePreset: null,
  enabled: true,
  focusMode: false,
  respectReducedMotion: true,
};

export function loadAudioSettings(): AudioSettings {
  if (typeof localStorage === "undefined") return { ...defaultAudioSettings };
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (!raw) return { ...defaultAudioSettings };
    const parsed = JSON.parse(raw) as Partial<AudioSettings>;
    return {
      ...defaultAudioSettings,
      ...parsed,
      masterVolume: clamp01(parsed.masterVolume ?? defaultAudioSettings.masterVolume),
      ambienceVolume: clamp01(
        parsed.ambienceVolume ?? defaultAudioSettings.ambienceVolume
      ),
      cueVolume: clamp01(parsed.cueVolume ?? defaultAudioSettings.cueVolume),
      voiceVolume: clamp01(parsed.voiceVolume ?? defaultAudioSettings.voiceVolume),
      soundscapePreset:
        typeof parsed.soundscapePreset === "string" || parsed.soundscapePreset === null
          ? parsed.soundscapePreset
          : defaultAudioSettings.soundscapePreset,
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : defaultAudioSettings.enabled,
      focusMode:
        typeof parsed.focusMode === "boolean" ? parsed.focusMode : defaultAudioSettings.focusMode,
      respectReducedMotion:
        typeof parsed.respectReducedMotion === "boolean"
          ? parsed.respectReducedMotion
          : defaultAudioSettings.respectReducedMotion,
    };
  } catch {
    return { ...defaultAudioSettings };
  }
}

export function saveAudioSettings(s: AudioSettings): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota / private mode */
  }
}

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
