# Bundled audio (soundscape + cues)

Layout:

- `soundscape/<preset>.opus` (or `.ogg` / `.wav`) — looping ambience. Enable by setting `soundscapePreset` in audio settings (API: `setAudioSettings({ soundscapePreset: "<preset>" })`).
- `cues/<snippet_id>/<voice_profile>.opus` — one-shots keyed by `AUDIO_SNIPPET_IDS` in `src/services/audio/cueRegistry.ts`. If that file is absent, playback falls back to a built-in quiet cymbal (no extra asset).

Snippet ids: `bg_runner_pulse`, `cache_refresh`, `cache_top_change`, `timer_due`, `scheduler_blip`, `wave_settled`.

Voice profiles used in default avatars include `default`, `muse`, and `ally`.

Generate WAVs locally with Piper:

```bash
node scripts/gen-audio-cues.mjs
```

See comments in that script for `PIPER_MODEL_*` environment variables. Transcode to Opus with `ffmpeg` if you want smaller files.
