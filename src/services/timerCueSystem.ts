/**
 * Timer and Cue System - enables the program to act outside user's direct control.
 * Supports: periodic timers, scheduled cues, external triggers.
 */

type CueCallback = (cue: { type: string; payload?: unknown }) => void;

const listeners = new Set<CueCallback>();
const timers = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Emit a cue to all listeners (e.g. "check-in", "scheduled-task", "timer-expired").
 */
export function emitCue(type: string, payload?: unknown): void {
  listeners.forEach((cb) => {
    try {
      cb({ type, payload });
    } catch (e) {
      console.error("Cue listener error:", e);
    }
  });
}

/**
 * Subscribe to cues.
 */
export function onCue(callback: CueCallback): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Schedule a one-shot timer. Returns a function to cancel.
 */
export function scheduleTimer(
  id: string,
  delayMs: number,
  cueType: string = "timer-expired",
  payload?: unknown
): () => void {
  cancelTimer(id);
  const handle = setTimeout(() => {
    timers.delete(id);
    emitCue(cueType, { ...(typeof payload === "object" && payload !== null ? payload : {}), timerId: id });
  }, delayMs);
  timers.set(id, handle as unknown as ReturnType<typeof setInterval>);
  return () => cancelTimer(id);
}

/**
 * Schedule a repeating interval.
 */
export function scheduleInterval(
  id: string,
  intervalMs: number,
  cueType: string = "interval",
  payload?: unknown
): () => void {
  cancelTimer(id);
  const handle = setInterval(() => {
    emitCue(cueType, { ...(typeof payload === "object" && payload !== null ? payload : {}), timerId: id });
  }, intervalMs);
  timers.set(id, handle);
  return () => cancelTimer(id);
}

export function cancelTimer(id: string): void {
  const handle = timers.get(id);
  if (handle) {
    clearInterval(handle);
    timers.delete(id);
  }
}
