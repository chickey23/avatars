/**
 * Session-scoped durable-change counter for the chat column UI.
 * Subscribers increment a running total; resets are owned by the React layer
 * (Clear chat / End topic). Listeners must not throw.
 */

type Listener = (delta: number) => void;

const listeners = new Set<Listener>();

export function emitSessionChangeDelta(delta = 1): void {
  if (delta <= 0) return;
  for (const l of listeners) {
    try {
      l(delta);
    } catch (err) {
      console.error("[sessionChangeTelemetry] listener threw", err);
    }
  }
}

export function subscribeSessionChangeDelta(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
