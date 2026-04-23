# Phase 2: Local TTS from Tauri (Piper)

Phase 1 uses static files under `public/audio`. For **dynamic** text at runtime while staying local and compact:

1. **Bundle Piper** — Add the `piper` executable and chosen `.onnx` + `.onnx.json` voice models under `src-tauri` resources (see [Tauri v2 resources](https://v2.tauri.app/develop/resources/)).
2. **Rust command** — Implement a Tauri command, e.g. `synthesize_speech { text, model_id }`, that:
   - Resolves the model path from the resource dir
   - Runs Piper as a child process (or links `piper-rs` if you prefer), writing a temp WAV
   - Returns the path or base64 payload to the frontend
3. **Frontend** — Decode the WAV with `decodeAudioData` and enqueue on the existing voice bus in `audioDirector.ts`, or write into the app cache directory and reuse the same queue.

Disk budget: a few Piper voices plus the binary are typically **well under 1 GB**, far below the 8 GB ceiling.

Alternative: keep Phase 1 only and call `scripts/gen-audio-cues.mjs` whenever copy changes; no runtime ML in the app binary.
