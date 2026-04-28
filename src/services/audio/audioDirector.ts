/**
 * Web Audio graph: master + ambience / cue / voice buses, soundscape loop, one-shots.
 */

import {
  loadAudioSettings,
  saveAudioSettings,
  prefersReducedMotion,
  type AudioSettings,
  defaultAudioSettings,
} from "./audioSettings";
import type { AudioSnippetId } from "./cueRegistry";
import {
  resolveCueClipUrl,
  resolveCueClipUrlAlternates,
  resolveSoundscapeUrl,
  resolveSoundscapeUrlAlternates,
} from "./cueRegistry";
import { emitAudioVisualCue, type AudioVisualEmitOpts } from "./audioVisualBus";

type VoiceQueueItem = {
  snippetId: AudioSnippetId;
  voiceProfileId: string;
  visual?: AudioVisualEmitOpts;
};

let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let ambienceGain: GainNode | null = null;
let cueGain: GainNode | null = null;
let voiceGain: GainNode | null = null;

let settings: AudioSettings = loadAudioSettings();

const bufferCache = new Map<string, AudioBuffer | "miss">();

let ambienceSource: AudioBufferSourceNode | null = null;
let activeSoundscapePreset: string | null = null;

let voiceBusy = false;
const voiceQueue: VoiceQueueItem[] = [];

let softTickBuffer: AudioBuffer | null = null;
let blipBuffer: AudioBuffer | null = null;
/** Very quiet metallic wash when a queued voice clip asset is missing (see `drainVoiceQueue`). */
let voiceSnippetMissBuffer: AudioBuffer | null = null;

function ensureGraph(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  ctx = new Ctx();
  masterGain = ctx.createGain();
  masterGain.connect(ctx.destination);

  ambienceGain = ctx.createGain();
  cueGain = ctx.createGain();
  voiceGain = ctx.createGain();

  ambienceGain.connect(masterGain);
  cueGain.connect(masterGain);
  voiceGain.connect(masterGain);

  applySettingsToGraph();
  return ctx;
}

function applySettingsToGraph(): void {
  if (!masterGain || !ambienceGain || !cueGain || !voiceGain || !ctx) return;
  const m = settings.enabled ? settings.masterVolume : 0;
  masterGain.gain.value = m;
  if (settings.focusMode) {
    ambienceGain.gain.value = settings.ambienceVolume;
    cueGain.gain.value = 0;
    voiceGain.gain.value = 0;
  } else {
    ambienceGain.gain.value = settings.ambienceVolume;
    cueGain.gain.value = settings.cueVolume;
    voiceGain.gain.value = settings.voiceVolume;
  }
}

export function getAudioSettings(): AudioSettings {
  return { ...settings };
}

export function setAudioSettings(patch: Partial<AudioSettings>): AudioSettings {
  settings = {
    ...settings,
    ...patch,
  };
  saveAudioSettings(settings);
  applySettingsToGraph();
  if (settings.soundscapePreset !== activeSoundscapePreset) {
    void refreshSoundscapeFromSettings();
  }
  return { ...settings };
}

export function resetAudioSettingsToDefaults(): AudioSettings {
  settings = { ...defaultAudioSettings };
  saveAudioSettings(settings);
  applySettingsToGraph();
  void refreshSoundscapeFromSettings();
  return { ...settings };
}

/**
 * Must run after user gesture for autoplay policies.
 */
export async function resumeAudioContext(): Promise<boolean> {
  const c = ensureGraph();
  if (!c) return false;
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      return false;
    }
  }
  return c.state === "running";
}

export function isAudioContextRunning(): boolean {
  return ctx?.state === "running";
}

function makeImpulseBuffer(c: BaseAudioContext, freq: number, duration: number, amp: number): AudioBuffer {
  const sampleRate = c.sampleRate;
  const n = Math.max(1, Math.floor(sampleRate * duration));
  const buf = c.createBuffer(1, n, sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 40);
    d[i] = env * Math.sin(2 * Math.PI * freq * t) * amp;
  }
  return buf;
}

function makeQuietCymbalBuffer(c: BaseAudioContext): AudioBuffer {
  const duration = 0.26;
  const sampleRate = c.sampleRate;
  const n = Math.max(1, Math.floor(sampleRate * duration));
  const buf = c.createBuffer(1, n, sampleRate);
  const d = buf.getChannelData(0);
  const partials: { f: number; a: number }[] = [
    { f: 4156, a: 0.88 },
    { f: 5831, a: 0.52 },
    { f: 7120, a: 0.32 },
    { f: 9340, a: 0.18 },
    { f: 11200, a: 0.11 },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 30);
    let sample = 0;
    for (let p = 0; p < partials.length; p++) {
      sample += partials[p].a * Math.sin(2 * Math.PI * partials[p].f * t + p * 0.71);
    }
    const air = Math.sin(i * 0.073) * Math.cos(i * 0.019) * env * 0.12;
    d[i] = (sample * 0.014 + air) * env;
  }
  return buf;
}

function ensureSyntheticBuffers(): void {
  const c = ctx;
  if (!c) return;
  if (!softTickBuffer) softTickBuffer = makeImpulseBuffer(c, 920, 0.075, 0.12);
  if (!blipBuffer) blipBuffer = makeImpulseBuffer(c, 1320, 0.055, 0.1);
}

function ensureVoiceSnippetMissBuffer(): void {
  const c = ctx;
  if (!c) return;
  if (!voiceSnippetMissBuffer) voiceSnippetMissBuffer = makeQuietCymbalBuffer(c);
}

/**
 * Plays on the cue bus when a bundled voice clip URL 404s — same checks as other one-shots.
 */
function playVoiceSnippetMissFallback(visual?: AudioVisualEmitOpts): void {
  if (!settings.enabled || settings.focusMode) return;
  if (settings.respectReducedMotion && prefersReducedMotion()) return;
  const c = ensureGraph();
  if (!c || !cueGain) return;
  ensureVoiceSnippetMissBuffer();
  const buf = voiceSnippetMissBuffer;
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = 0.42;
  src.connect(g);
  g.connect(cueGain);
  const now = c.currentTime;
  src.start(now);
  src.stop(now + buf.duration + 0.02);
  if (visual) {
    emitAudioVisualCue({
      anchor: visual.anchor,
      avatarId: visual.avatarId,
      cueId: visual.cueId ?? "voice_snippet:missing",
    });
  }
}

export type SyntheticCueKind = "soft_tick" | "blip" | "shimmer";

/** Low-level SFX on the cue bus (always uses synthetic buffer, no network). */
export function playSyntheticCue(
  kind: SyntheticCueKind,
  visual?: AudioVisualEmitOpts
): void {
  if (!settings.enabled || settings.focusMode) return;
  if (settings.respectReducedMotion && prefersReducedMotion()) return;
  const c = ensureGraph();
  if (!c || !cueGain) return;
  ensureSyntheticBuffers();
  const buf =
    kind === "blip" ? blipBuffer : kind === "shimmer" ? softTickBuffer : softTickBuffer;
  if (!buf) return;
  const src = c.createBufferSource();
  src.buffer = buf;
  const g = c.createGain();
  g.gain.value = kind === "shimmer" ? 0.65 : 1;
  src.connect(g);
  g.connect(cueGain);
  const now = c.currentTime;
  src.start(now);
  src.stop(now + buf.duration + 0.02);
  if (visual) {
    emitAudioVisualCue({
      anchor: visual.anchor,
      avatarId: visual.avatarId,
      cueId: visual.cueId ?? `synthetic:${kind}`,
    });
  }
}

async function fetchDecode(url: string): Promise<AudioBuffer | null> {
  const c = ctx;
  if (!c) return null;
  if (bufferCache.get(url) === "miss") return null;
  const hit = bufferCache.get(url);
  if (hit && hit !== "miss") return hit;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      bufferCache.set(url, "miss");
      return null;
    }
    const arr = await res.arrayBuffer();
    const buf = await c.decodeAudioData(arr.slice(0));
    bufferCache.set(url, buf);
    return buf;
  } catch {
    bufferCache.set(url, "miss");
    return null;
  }
}

async function loadSnippetBuffer(
  snippetId: AudioSnippetId,
  voiceProfileId: string
): Promise<AudioBuffer | null> {
  const urls = [
    resolveCueClipUrl(snippetId, voiceProfileId, "opus"),
    ...resolveCueClipUrlAlternates(snippetId, voiceProfileId),
  ];
  for (const u of urls) {
    const b = await fetchDecode(u);
    if (b) return b;
  }
  return null;
}

function stopAmbience(): void {
  if (ambienceSource && ctx) {
    try {
      const now = ctx.currentTime;
      ambienceSource.stop(now);
    } catch {
      /* already stopped */
    }
    ambienceSource.disconnect();
    ambienceSource = null;
  }
  activeSoundscapePreset = null;
}

async function startAmbiencePreset(presetId: string): Promise<void> {
  const c = ensureGraph();
  if (!c || !ambienceGain) return;
  stopAmbience();
  const scUrls = [
    resolveSoundscapeUrl(presetId, "opus"),
    ...resolveSoundscapeUrlAlternates(presetId),
  ];
  let buf: AudioBuffer | null = null;
  for (const u of scUrls) {
    buf = await fetchDecode(u);
    if (buf) break;
  }
  if (!buf) {
    activeSoundscapePreset = null;
    return;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = c.createGain();
  g.gain.value = 0;
  src.connect(g);
  g.connect(ambienceGain);
  const now = c.currentTime;
  g.gain.linearRampToValueAtTime(1, now + 0.45);
  src.start(now);
  ambienceSource = src;
  activeSoundscapePreset = presetId;
}

async function refreshSoundscapeFromSettings(): Promise<void> {
  const preset = settings.soundscapePreset;
  if (!preset) {
    stopAmbience();
    return;
  }
  if (preset === activeSoundscapePreset && ambienceSource) return;
  await startAmbiencePreset(preset);
}

/** Call after settings change and on resume. */
export function syncSoundscape(): void {
  void refreshSoundscapeFromSettings();
}

function playBufferOnVoiceBus(
  buffer: AudioBuffer,
  whenDone: () => void,
  visual?: AudioVisualEmitOpts,
  snippetId?: AudioSnippetId
): void {
  const c = ctx;
  if (!c || !voiceGain) {
    whenDone();
    return;
  }
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(voiceGain);
  const now = c.currentTime;
  src.onended = () => whenDone();
  src.start(now);
  if (visual) {
    emitAudioVisualCue({
      anchor: visual.anchor,
      avatarId: visual.avatarId,
      cueId: visual.cueId ?? snippetId,
    });
  }
}

function drainVoiceQueue(): void {
  if (voiceBusy || voiceQueue.length === 0) return;
  if (!settings.enabled || settings.focusMode) {
    voiceQueue.length = 0;
    return;
  }
  const next = voiceQueue.shift()!;
  voiceBusy = true;
  void (async () => {
    const buf = await loadSnippetBuffer(next.snippetId, next.voiceProfileId);
    if (!buf) {
      playVoiceSnippetMissFallback(next.visual);
      voiceBusy = false;
      drainVoiceQueue();
      return;
    }
    playBufferOnVoiceBus(
      buf,
      () => {
        voiceBusy = false;
        drainVoiceQueue();
      },
      next.visual,
      next.snippetId
    );
  })();
}

/**
 * Enqueue a voice clip for an avatar profile. Non-overlapping playback.
 */
export function enqueueVoiceSnippet(
  snippetId: AudioSnippetId,
  voiceProfileId: string,
  visual?: AudioVisualEmitOpts
): void {
  if (!settings.enabled || settings.focusMode) return;
  if (settings.respectReducedMotion && prefersReducedMotion()) return;
  ensureGraph();
  voiceQueue.push({ snippetId, voiceProfileId, visual });
  drainVoiceQueue();
}

/** Immediate synthetic cue on SFX bus (for background ticks). */
export function playCueSynthetic(
  kind: SyntheticCueKind,
  visual?: AudioVisualEmitOpts
): void {
  playSyntheticCue(kind, visual);
}

export function __resetAudioDirectorForTests(): void {
  stopAmbience();
  voiceQueue.length = 0;
  voiceBusy = false;
  bufferCache.clear();
  softTickBuffer = null;
  blipBuffer = null;
  voiceSnippetMissBuffer = null;
  if (ctx) {
    try {
      void ctx.close();
    } catch {
      /* */
    }
  }
  ctx = null;
  masterGain = null;
  ambienceGain = null;
  cueGain = null;
  voiceGain = null;
  settings = { ...defaultAudioSettings };
}
