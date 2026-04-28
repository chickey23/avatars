---
name: avatars-audio-cues
description: >-
  Maps Avatars Web Audio stack: cue/snippet ids, sound Director buses, platform
  bridge, assets, and synth fallbacks. Sound coverage is incomplete; this skill
  should be updated when audio code or assets change materially. Use when editing
  src/services/audio/, public/audio/, enqueueVoiceSnippet/playCueSynthetic,
  platform bus audio, or audio–visual pulse behavior.
---

# Avatars audio and cues

## Scope and limitations

- The Avatars **sound/audio subsystem is incomplete** (missing or partial bundled assets, PROGRESS “Audio + visual” follow-ups, UX polish). Do not treat this skill or the codebase as a finished, exhaustive catalog of every product sound.
- **Maintain this skill alongside the system**: substantive changes under [`src/services/audio/`](../../../src/services/audio/), new `AUDIO_SNIPPET_IDS`, bus wiring, or [`public/audio/`](../../../public/audio/) layout should include an update here (same spirit as keeping [`public/audio/README.md`](../../../public/audio/README.md) accurate).

---

## When to use

- Debugging or extending **cues**, **soundscape**, **voice-bus queue**, **synthetic SFX**, or **audio-visual pulses**.
- Wiring **platform/timer/cache** events into sound (go through the bridge, not ad hoc `Audio()`).
- Choosing or adding **`AudioSnippetId`** values and file paths under `public/audio/`.

---

## Key files

| Area | Path |
|------|------|
| Snippet ids + URL resolution | [`src/services/audio/cueRegistry.ts`](../../../src/services/audio/cueRegistry.ts) |
| Web Audio graph, soundscape, queue, synth cues | [`src/services/audio/audioDirector.ts`](../../../src/services/audio/audioDirector.ts) |
| Persisted levels, focus mode, reduced motion | [`src/services/audio/audioSettings.ts`](../../../src/services/audio/audioSettings.ts) |
| Platform bus → throttled `enqueueVoiceSnippet` / `playCueSynthetic` | [`src/services/audio/platformAudioBridge.ts`](../../../src/services/audio/platformAudioBridge.ts) |
| Pulse pub/sub for UI sync | [`src/services/audio/audioVisualBus.ts`](../../../src/services/audio/audioVisualBus.ts) |
| High-frequency event coalescing | [`src/services/audio/eventThrottle.ts`](../../../src/services/audio/eventThrottle.ts) |
| Barrel exports | [`src/services/audio/index.ts`](../../../src/services/audio/index.ts) |
| Bundled assets layout + Piper script | [`public/audio/README.md`](../../../public/audio/README.md), [`scripts/gen-audio-cues.mjs`](../../../scripts/gen-audio-cues.mjs) |
| Cursor rule (Tauri/platform + audio) | [`.cursor/rules/avatars-audio-platform.mdc`](../../rules/avatars-audio-platform.mdc) |

---

## Snippet ids (`AUDIO_SNIPPET_IDS`)

Defined in [`cueRegistry.ts`](../../../src/services/audio/cueRegistry.ts). Files live at `public/audio/cues/<snippet_id>/<voice_profile>.opus` (or `.ogg` / `.wav` fallbacks).

| Key | String id |
|-----|-----------|
| `bgRunnerPulse` | `bg_runner_pulse` |
| `cacheRefresh` | `cache_refresh` |
| `cacheTopChange` | `cache_top_change` |
| `timerDue` | `timer_due` |
| `schedulerBlip` | `scheduler_blip` |
| `waveSettled` | `wave_settled` |
| `avatarCreationTaskDone` | `avatar_creation_task_done` |

Voice profile comes from `avatar.appearance.voiceProfileId` or **`default`** ([`voiceProfileIdForAvatar`](../../../src/services/audio/cueRegistry.ts)).

---

## Director behavior (short)

- **Buses**: master → ambience (soundscape loop), cue (one-shots / synthetic), voice (non-overlapping queue for file-based snippets).
- **Soundscape**: `setAudioSettings({ soundscapePreset: "<id>" })` → [`resolveSoundscapeUrl`](../../../src/services/audio/cueRegistry.ts); files under `public/audio/soundscape/`.
- **Synthetic cues** (no network): [`SyntheticCueKind`](../../../src/services/audio/audioDirector.ts) = `soft_tick` | `blip` | `shimmer` — [`playCueSynthetic`](../../../src/services/audio/audioDirector.ts) on the **cue** bus.
- **Voice queue**: [`enqueueVoiceSnippet`](../../../src/services/audio/audioDirector.ts) decodes files in order; **if all URLs fail**, a **built-in quiet cymbal** plays on the cue bus and optional visual uses `cueId` `voice_snippet:missing` (see [`audioDirector.ts`](../../../src/services/audio/audioDirector.ts) `drainVoiceQueue` / `playVoiceSnippetMissFallback`).
- **Resume**: [`resumeAudioContext()`](../../../src/services/audio/audioDirector.ts) after user gesture (autoplay policies).

---

## Verification

After material audio changes, follow [`.cursor/skills/avatars-capability-smoke/SKILL.md`](../avatars-capability-smoke/SKILL.md): `npm run verify` and a quick cue/sound path smoke when appropriate.
