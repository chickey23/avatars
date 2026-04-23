/**
 * Lightweight pub/sub so UI can pulse in sync with audible cues.
 */

export type AudioVisualAnchor = "switchboard" | "storage" | "avatar" | "global";

export type AudioVisualCuePayload = {
  anchor: AudioVisualAnchor;
  avatarId?: string;
  cueId?: string;
  atMs: number;
};

/** Passed into audio APIs to fire a synchronized visual pulse. */
export type AudioVisualEmitOpts = {
  anchor: AudioVisualAnchor;
  avatarId?: string;
  cueId?: string;
};

type Listener = (p: AudioVisualCuePayload) => void;

const listeners = new Set<Listener>();

export function emitAudioVisualCue(
  payload: Omit<AudioVisualCuePayload, "atMs"> & { atMs?: number }
): void {
  const full: AudioVisualCuePayload = {
    anchor: payload.anchor,
    avatarId: payload.avatarId,
    cueId: payload.cueId,
    atMs: payload.atMs ?? Date.now(),
  };
  for (const l of listeners) {
    try {
      l(full);
    } catch (e) {
      console.error("[audioVisualBus] listener threw", e);
    }
  }
}

export function subscribeAudioVisualCue(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Test helper */
export function __clearAudioVisualListenersForTests(): void {
  listeners.clear();
}
