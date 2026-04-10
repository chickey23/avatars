/**
 * Offline detection and fallback.
 * Enables graceful degradation when network is unavailable.
 */

let cachedOnline = typeof navigator !== "undefined" ? navigator.onLine : true;

export function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

export function setCachedOnline(value: boolean): void {
  cachedOnline = value;
}

export function getCachedOnline(): boolean {
  return cachedOnline;
}

export function onOnlineChange(callback: (online: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => {
    cachedOnline = navigator.onLine;
    callback(cachedOnline);
  };
  window.addEventListener("online", handler);
  window.addEventListener("offline", handler);
  handler();
  return () => {
    window.removeEventListener("online", handler);
    window.removeEventListener("offline", handler);
  };
}
