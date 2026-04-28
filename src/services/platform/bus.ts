/**
 * Platform event bus. Runners emit structured events here; the UI layer
 * subscribes to convert them into Wave rows / badge updates. Kept
 * deliberately narrow — one event type per observable behavior.
 */

import type { SourceCacheKind, SourceCacheSnapshot } from "./sourceCache";
import type { SchedulerFireEvent } from "./scheduler";

export type AvatarCreationTaskSatisfiedEvent = {
  type: "avatar_creation_task_satisfied";
  taskId: string;
  matchedAvatarId: string;
};

export type PlatformBusEvent =
  | {
      type: "source_cache_updated";
      kind: SourceCacheKind;
      snapshot: SourceCacheSnapshot;
    }
  | {
      type: "source_top_changed";
      kind: SourceCacheKind;
      addedIds: string[];
      removedIds: string[];
      snapshot: SourceCacheSnapshot;
    }
  | {
      type: "runner_heartbeat";
      kind: SourceCacheKind;
      fetchedAt: number;
      durationMs: number;
      itemCount: number;
    }
  | AvatarCreationTaskSatisfiedEvent
  | SchedulerFireEvent;

type Listener = (e: PlatformBusEvent) => void;

const listeners = new Set<Listener>();

export function publishPlatformEvent(e: PlatformBusEvent): void {
  for (const l of listeners) {
    try {
      l(e);
    } catch (err) {
      console.error("[platform bus] listener threw", err);
    }
  }
}

export function subscribePlatformEvents(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Diff two ordered topK lists for wave emission. */
export function diffTopK(
  prev: readonly string[],
  next: readonly string[]
): { addedIds: string[]; removedIds: string[] } {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  const addedIds = next.filter((id) => !prevSet.has(id));
  const removedIds = prev.filter((id) => !nextSet.has(id));
  return { addedIds, removedIds };
}
