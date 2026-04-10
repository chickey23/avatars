/**
 * Web companion API client.
 * Phase 6: When running as web app, use this to talk to backend instead of local store.
 */

import type {
  SituationContext,
  SituationFocus,
  Avatar,
  ConversationMessage,
} from "../types";

const DEFAULT_BASE = "/api";

export interface ApiConfig {
  baseUrl: string;
}

export function createApiClient(config: Partial<ApiConfig> = {}) {
  const base = config.baseUrl ?? DEFAULT_BASE;

  async function fetchJson<T>(path: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", ...options?.headers },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json() as Promise<T>;
  }

  return {
    getContext: () =>
      fetchJson<SituationContext>(`/context`),

    getAvatars: () =>
      fetchJson<Avatar[]>(`/avatars`),

    sendMessage: (
      content: string,
      selectedAvatarId: string,
      focus?: SituationFocus
    ) =>
      fetchJson<{ updatedContext: SituationContext; newMessages: ConversationMessage[] }>(
        `/message`,
        {
          method: "POST",
          body: JSON.stringify({ content, selectedAvatarId, focus }),
        }
      ),

    assignTask: (avatarId: string, title: string, description?: string) =>
      fetchJson<{ id: string }>(`/tasks`, {
        method: "POST",
        body: JSON.stringify({ avatarId, title, description }),
      }),

    getTasks: (avatarId: string) =>
      fetchJson<{ id: string; avatarId: string; title: string; status: string }[]>(
        `/tasks?avatarId=${encodeURIComponent(avatarId)}`
      ),
  };
}

export const apiClient = createApiClient();
