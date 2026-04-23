/**
 * Rate limiting for background audio cues (pure, testable).
 */

export type ThrottleState = {
  lastFireAt: number;
};

export function createThrottleState(): ThrottleState {
  return { lastFireAt: 0 };
}

/**
 * Returns true if the action should run now, and updates lastFireAt when it does.
 */
export function tryThrottle(
  state: ThrottleState,
  minIntervalMs: number,
  now: number
): boolean {
  if (state.lastFireAt === 0 || now - state.lastFireAt >= minIntervalMs) {
    state.lastFireAt = now;
    return true;
  }
  return false;
}

/**
 * Coalesce: allow at most one fire per window; repeated calls reset the window.
 */
export type CoalesceState = {
  pending: boolean;
  windowEndAt: number;
};

export function createCoalesceState(): CoalesceState {
  return { pending: false, windowEndAt: 0 };
}

/**
 * Call on each event. Invokes `fire` once per window when events occurred.
 */
export function coalesceInWindow(
  state: CoalesceState,
  windowMs: number,
  now: number,
  fire: () => void
): void {
  if (!state.pending) {
    state.pending = true;
    state.windowEndAt = now + windowMs;
    fire();
    return;
  }
  state.windowEndAt = now + windowMs;
}

/** Run pending coalesced callback after window elapses (call from a timer tick). */
export function flushCoalesce(
  state: CoalesceState,
  now: number,
  fire: () => void
): void {
  if (state.pending && now >= state.windowEndAt) {
    state.pending = false;
    fire();
  }
}
