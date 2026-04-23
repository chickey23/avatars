export {
  loadAudioSettings,
  saveAudioSettings,
  defaultAudioSettings,
  prefersReducedMotion,
  AUDIO_SETTINGS_STORAGE_KEY,
  type AudioSettings,
} from "./audioSettings";
export {
  getAudioSettings,
  setAudioSettings,
  resetAudioSettingsToDefaults,
  resumeAudioContext,
  isAudioContextRunning,
  syncSoundscape,
  enqueueVoiceSnippet,
  playCueSynthetic,
  type SyntheticCueKind,
  __resetAudioDirectorForTests,
} from "./audioDirector";
export {
  AUDIO_SNIPPET_IDS,
  DEFAULT_VOICE_PROFILE_ID,
  isAudioSnippetId,
  resolveCueClipUrl,
  resolveCueClipUrlAlternates,
  resolveSoundscapeUrl,
  resolveSoundscapeUrlAlternates,
  voiceProfileIdForAvatar,
  type AudioSnippetId,
} from "./cueRegistry";
export { mountPlatformAudioBridge, type PlatformAudioBridgeOptions } from "./platformAudioBridge";
export {
  createThrottleState,
  tryThrottle,
  createCoalesceState,
  coalesceInWindow,
  flushCoalesce,
} from "./eventThrottle";
export {
  emitAudioVisualCue,
  subscribeAudioVisualCue,
  __clearAudioVisualListenersForTests,
  type AudioVisualAnchor,
  type AudioVisualCuePayload,
  type AudioVisualEmitOpts,
} from "./audioVisualBus";
