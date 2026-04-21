/**
 * Gmail connector - read-only via Gmail API and OAuth 2.0.
 * Uses Tauri commands when available; falls back to mock when not.
 */

import type { EmailItem } from "./types";
import { appendSessionLog } from "../services/sessionLog";

export interface GmailMessage {
  id: string;
  threadId?: string;
  from: string;
  subject: string;
  snippet: string;
  date: number;
}

function toEmailItem(m: GmailMessage): EmailItem {
  return {
    id: m.id,
    ...(m.threadId ? { threadId: m.threadId } : {}),
    from: m.from,
    subject: m.subject,
    snippet: m.snippet,
    date: m.date,
  };
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

/** Fallback path when Tauri path is unavailable (e.g. running Vite only) */
function getFallbackCredentialsPath(): string {
  if (typeof navigator !== "undefined" && navigator.platform?.toLowerCase().includes("win")) {
    return "%APPDATA%\\com.avatars.app\\data\\connections\\enabled\\gmail\\credentials.json";
  }
  return "~/.config/com.avatars.app/data/connections/enabled/gmail/credentials.json";
}

export interface GmailPathResult {
  path: string;
  source: "tauri" | "fallback";
  error?: string;
}

/** Path where credentials.json should be placed */
export async function getGmailCredentialsPath(): Promise<GmailPathResult> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = await invoke<string>("gmail_credentials_path_display");
      if (path) return { path, source: "tauri" };
    } catch (e) {
      return {
        path: getFallbackCredentialsPath(),
        source: "fallback",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }
  return { path: getFallbackCredentialsPath(), source: "fallback" };
}

/** Environment info for debugging */
export function getTauriEnv(): { tauri: boolean } {
  return { tauri: isTauri() };
}

/** Check if Gmail credentials are set up (can connect) */
export async function isGmailEnabled(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("is_gmail_enabled");
  } catch {
    return false;
  }
}

/** Check if Gmail is connected (has tokens) */
export async function hasGmailTokens(): Promise<boolean> {
  if (!isTauri()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<boolean>("has_gmail_tokens");
  } catch {
    return false;
  }
}

/** Start OAuth flow - opens browser, waits for callback */
export async function startGmailOAuth(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("start_gmail_oauth");
}

/** Fetch recent emails from Gmail. Throws on error. */
export async function fetchGmailRecent(limit = 10): Promise<EmailItem[]> {
  if (!isTauri()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  const messages = await invoke<GmailMessage[]>("fetch_gmail_recent", { limit });
  return messages.map(toEmailItem);
}

/** Gmail connector implementing IEmailConnector */
export const gmailConnector = {
  async fetchRecent(limit = 5): Promise<EmailItem[]> {
    const enabled = await isGmailEnabled();
    if (!enabled) return [];
    return fetchGmailRecent(limit);
  },
};

/** Fetch upcoming calendar events. Uses same Google OAuth as Gmail. Throws on error. */
export async function fetchCalendarUpcoming(
  days = 30,
  maxResults = 50
): Promise<import("./types").CalendarEvent[]> {
  if (!isTauri()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<import("./types").CalendarEvent[]>("fetch_calendar_upcoming", {
    days,
    maxResults,
  });
}

/** Fetch contacts from Google People API. Uses same Google OAuth as Gmail. Throws on error. */
export async function fetchContacts(limit = 50): Promise<import("./types").Contact[]> {
  if (!isTauri()) return [];
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<import("./types").Contact[]>("fetch_contacts", { limit });
}

export type GmailMessageBodyFetch = {
  body: string | null;
  threadId?: string;
};

/**
 * Full email body text for a message id (Gmail API `format=full`).
 * Returns null body if not in Tauri, on error, or empty body.
 */
export async function fetchGmailMessageBody(
  messageId: string
): Promise<GmailMessageBodyFetch> {
  if (!isTauri() || !messageId.trim()) {
    return { body: null };
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const res = await invoke<{ text: string; threadId?: string }>(
      "gmail_fetch_message_body",
      {
        messageId,
      }
    );
    const text = res?.text?.trim() ?? "";
    const threadId =
      typeof res?.threadId === "string" && res.threadId.trim()
        ? res.threadId.trim()
        : undefined;
    return {
      body: text ? text : null,
      ...(threadId ? { threadId } : {}),
    };
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    appendSessionLog("gmail", "gmail_fetch_message_body failed", {
      level: "warn",
      detail: errMsg.slice(0, 400),
    });
    return { body: null };
  }
}
