#!/usr/bin/env node
/**
 * Batch-generate cue WAVs with Piper (Phase 1 assets).
 *
 * Prerequisites:
 *   - Piper binary on PATH or set PIPER_EXE
 *   - ONNX model per voice profile: PIPER_MODEL_default, PIPER_MODEL_muse, etc.
 *     (full path to the .onnx file; .onnx.json must sit beside it)
 *
 * Usage (PowerShell):
 *   $env:PIPER_MODEL_default="C:\piper\en_US-lessac-medium.onnx"
 *   $env:PIPER_MODEL_muse="C:\piper\en_US-amy-medium.onnx"
 *   $env:PIPER_MODEL_ally="C:\piper\en_US-danny-low.onnx"
 *   node scripts/gen-audio-cues.mjs
 *
 * Outputs: public/audio/cues/<snippet>/<profile>.wav
 * Optional: transcode to Opus with ffmpeg for smaller files:
 *   ffmpeg -y -i in.wav -c:a libopus -b:a 48k out.opus
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outRoot = path.join(root, "public", "audio", "cues");

const SNIPPETS = [
  "bg_runner_pulse",
  "cache_refresh",
  "cache_top_change",
  "timer_due",
  "scheduler_blip",
  "wave_settled",
];

/** Short lines; keep clips small for UI cues. */
const PHRASES = {
  bg_runner_pulse: "Sync.",
  cache_refresh: "Updated.",
  cache_top_change: "New top.",
  timer_due: "Time.",
  scheduler_blip: "Reminder.",
  wave_settled: "Done.",
};

const PROFILES = ["default", "muse", "ally"];

function piperModelForProfile(profile) {
  const envKey = `PIPER_MODEL_${profile}`;
  const v = process.env[envKey];
  if (!v) {
    console.error(`Missing env ${envKey} (path to .onnx model)`);
    process.exit(1);
  }
  return v;
}

function runPiper(text, modelPath, outFile) {
  const piper = process.env.PIPER_EXE || "piper";
  const r = spawnSync(piper, ["--model", modelPath, "--output_file", outFile], {
    input: text,
    encoding: "utf-8",
  });
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout || `piper exited ${r.status}`);
    process.exit(1);
  }
}

function main() {
  for (const profile of PROFILES) {
    const model = piperModelForProfile(profile);
    for (const snippet of SNIPPETS) {
      const phrase = PHRASES[snippet];
      const dir = path.join(outRoot, snippet);
      fs.mkdirSync(dir, { recursive: true });
      const outFile = path.join(dir, `${profile}.wav`);
      runPiper(phrase, model, outFile);
      console.log("wrote", path.relative(root, outFile));
    }
  }
}

main();
