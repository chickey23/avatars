/**
 * Session log: in-memory ring buffer for the UI + optional Tauri disk persistence.
 * Disk: `%LOCALAPPDATA%\\avatars\\session_logs\\` (see Rust `session_log`), max 100 `.log`
 * files then archive batch to `archives/session_logs_<ts>.zip`.
 */

export type SessionLogLevel = "info" | "warn" | "error";

export interface SessionLogEntry {
  ts: number;
  level: SessionLogLevel;
  category: string;
  message: string;
  detail?: string;
}

export interface SessionLogDiskInfo {
  archived: boolean;
  archiveNote: string | null;
  currentFile: string;
  logDir: string;
  alreadyStarted: boolean;
}

const MAX_ENTRIES = 800;
const entries: SessionLogEntry[] = [];
const listeners = new Set<() => void>();

const pendingDiskLines: string[] = [];
let diskInitialized = false;
let diskQueue: Promise<void> = Promise.resolve();

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

function notify(): void {
  for (const l of listeners) l();
}

function queueDiskAppend(line: string): void {
  if (!isTauri() || !diskInitialized) return;
  diskQueue = diskQueue
    .then(async () => {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("session_log_append", { line });
    })
    .catch((e: unknown) => {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[session_log disk]", e);
      entries.push({
        ts: Date.now(),
        level: "error",
        category: "session_log",
        message: "disk append failed",
        detail: msg,
      });
      while (entries.length > MAX_ENTRIES) entries.shift();
      notify();
    });
}

function flushPendingDiskLines(): void {
  const lines = pendingDiskLines.splice(0, pendingDiskLines.length);
  for (const line of lines) {
    queueDiskAppend(line);
  }
}

/**
 * Call once in Tauri after window load, before other subsystems log heavily.
 * Shows `alert()` if 100 log files were archived.
 */
export async function initSessionLogDisk(): Promise<SessionLogDiskInfo | null> {
  if (!isTauri()) {
    diskInitialized = true;
    return null;
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const r = await invoke<SessionLogDiskInfo>("session_log_begin_session");
    diskInitialized = true;
    flushPendingDiskLines();
    return r;
  } catch (e) {
    console.error("[session_log] initSessionLogDisk", e);
    diskInitialized = true;
    flushPendingDiskLines();
    return null;
  }
}

export function appendSessionLog(
  category: string,
  message: string,
  opts?: { level?: SessionLogLevel; detail?: string }
): void {
  entries.push({
    ts: Date.now(),
    level: opts?.level ?? "info",
    category,
    message,
    detail: opts?.detail,
  });
  while (entries.length > MAX_ENTRIES) entries.shift();
  notify();

  const line = formatSessionLogLine(entries[entries.length - 1]);
  if (isTauri()) {
    if (!diskInitialized) {
      pendingDiskLines.push(line);
    } else {
      queueDiskAppend(line);
    }
  }
}

export function getSessionLogSnapshot(): readonly SessionLogEntry[] {
  return entries;
}

export function clearSessionLog(): void {
  entries.length = 0;
  notify();
  const stamp = new Date().toISOString();
  const line = `[${stamp}] [info] session: UI memory buffer cleared by user`;
  if (isTauri()) {
    if (!diskInitialized) {
      pendingDiskLines.push(line);
    } else {
      queueDiskAppend(line);
    }
  }
}

export function subscribeSessionLog(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

export function formatSessionLogLine(e: SessionLogEntry): string {
  const t = new Date(e.ts).toISOString();
  const d = e.detail ? ` | ${e.detail}` : "";
  return `[${t}] [${e.level}] ${e.category}: ${e.message}${d}`;
}

export function formatSessionLogText(): string {
  return getSessionLogSnapshot().map(formatSessionLogLine).join("\n");
}
