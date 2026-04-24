import { loadToolWorkshopDoc } from "./persist";
import { loadToolTelemetryFromStorage } from "../toolTelemetry";

export type AutoRefinerTrigger =
  | { run: false }
  | { run: true; reason: "interval" | "failure_delta" };

/**
 * Decide whether the app should invoke the refiner (caller still checks Ollama, etc.).
 */
export function evaluateAutoRefinerTrigger(nowMs: number): AutoRefinerTrigger {
  const doc = loadToolWorkshopDoc();
  if (!doc.settings.refinerAutoEnabled) return { run: false };

  const telemetry = loadToolTelemetryFromStorage();
  const failCount = telemetry.events.filter((e) => !e.ok).length;
  if (failCount === 0) return { run: false };

  const lastSnap = doc.lastRefinerFailureSnapshot ?? 0;
  const delta = failCount - lastSnap;
  const threshold = doc.settings.refinerFailureDeltaThreshold;

  if (threshold > 0 && delta >= threshold) {
    return { run: true, reason: "failure_delta" };
  }

  const hours = doc.settings.refinerIntervalHours;
  if (hours > 0) {
    const last = doc.lastRefinerAttemptAt ?? 0;
    if (nowMs >= last + hours * 3600_000) {
      return { run: true, reason: "interval" };
    }
  }

  return { run: false };
}
