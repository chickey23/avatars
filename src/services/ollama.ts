/**
 * Local LLM integration (Ollama).
 * Phase 5: prepares for offline capability via local models.
 * In Tauri, uses Rust commands to reach 127.0.0.1:11434 (avoids webview fetch/CORS issues).
 */

import { appendSessionLog } from "./sessionLog";

const OLLAMA_BASE = "http://localhost:11434";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

function logOllamaError(context: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[ollama] ${context}:`, msg);
  appendSessionLog("ollama", context, { level: "error", detail: msg });
}

export interface OllamaGenerateOptions {
  model?: string;
  prompt: string;
  stream?: boolean;
}

export interface OllamaGenerateResponse {
  response: string;
  done: boolean;
}

/** Structured outcome from `/api/generate` (browser) or `ollama_generate` (Tauri). */
export type OllamaGenerateResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

function shortError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 220 ? `${msg.slice(0, 217)}…` : msg;
}

interface TagsResponse {
  models?: { name?: string }[];
}

async function fetchModelNamesBrowser(): Promise<string[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const j = (await res.json()) as TagsResponse;
    return (j.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
  } catch {
    return [];
  }
}

/** Ollama at 127.0.0.1:11434: server down vs up-without-models vs ready to generate. */
export type OllamaPresence = "no_server" | "no_models" | "ready";

function parsePresence(s: string): OllamaPresence {
  if (s === "no_models" || s === "ready") return s;
  return "no_server";
}

/**
 * Model names reported by Ollama (empty if server down or no models pulled).
 */
export async function getOllamaModelNames(): Promise<string[]> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string[]>("ollama_list_models");
    } catch (e) {
      logOllamaError("ollama_list_models invoke", e);
      return [];
    }
  }
  return fetchModelNamesBrowser();
}

/**
 * Whether the Ollama HTTP API is reachable and returns tags (tri-state).
 */
export async function getOllamaPresence(): Promise<OllamaPresence> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const s = await invoke<string>("ollama_presence");
      return parsePresence(s);
    } catch (e) {
      logOllamaError("ollama_presence invoke", e);
      return "no_server";
    }
  }
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return "no_server";
    const j = (await res.json()) as TagsResponse;
    const names = (j.models ?? [])
      .map((m) => m.name)
      .filter((n): n is string => typeof n === "string" && n.length > 0);
    return names.length === 0 ? "no_models" : "ready";
  } catch {
    return "no_server";
  }
}

/**
 * True when at least one model is available for generation (same as presence === `ready`).
 */
export async function isOllamaAvailable(): Promise<boolean> {
  return (await getOllamaPresence()) === "ready";
}

/**
 * Generate completion from Ollama.
 * When `model` is omitted, uses the first model returned by Ollama (same as `ollama run` with no tag).
 */
export async function generateWithOllama(
  options: OllamaGenerateOptions
): Promise<OllamaGenerateResult> {
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      /** Tauri maps the Rust parameter name `payload` to this key. */
      const text = await invoke<string>("ollama_generate", {
        payload: {
          model: options.model ?? null,
          prompt: options.prompt,
        },
      });
      const trimmed = text?.trim() ?? "";
      if (!trimmed) {
        appendSessionLog("ollama", "ollama_generate returned empty body", {
          level: "warn",
        });
        return { ok: false, error: "empty response" };
      }
      appendSessionLog("ollama", "ollama_generate ok", {
        level: "info",
        detail: `${trimmed.length} chars`,
      });
      return { ok: true, text: trimmed };
    } catch (e) {
      logOllamaError("ollama_generate invoke", e);
      return { ok: false, error: shortError(e) };
    }
  }
  let model = options.model;
  if (!model?.trim()) {
    const names = await fetchModelNamesBrowser();
    model = names[0];
    if (!model) {
      console.error("[ollama] generate: no models pulled; run `ollama pull <model>`");
      appendSessionLog("ollama", "generate (browser): no models pulled", {
        level: "warn",
      });
      return { ok: false, error: "no models pulled (run `ollama pull <model>`)" };
    }
  }
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: options.prompt,
        stream: options.stream ?? false,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      const t = await res.text();
      const tail = t.length > 180 ? `${t.slice(0, 177)}…` : t;
      console.error(`[ollama] generate HTTP ${res.status}:`, t);
      appendSessionLog("ollama", `generate (browser) HTTP ${res.status}`, {
        level: "error",
        detail: tail || undefined,
      });
      return { ok: false, error: `HTTP ${res.status}${tail ? `: ${tail}` : ""}` };
    }
    const json = (await res.json()) as OllamaGenerateResponse;
    const out = json.response?.trim() ?? "";
    if (!out) {
      appendSessionLog("ollama", "generate (browser): empty response body", {
        level: "warn",
      });
      return { ok: false, error: "empty response" };
    }
    appendSessionLog("ollama", "generate (browser) ok", {
      level: "info",
      detail: `${out.length} chars`,
    });
    return { ok: true, text: out };
  } catch (e) {
    logOllamaError("generate fetch", e);
    const msg = shortError(e);
    if (msg.includes("TimeoutError") || msg.toLowerCase().includes("timeout")) {
      return { ok: false, error: "timeout" };
    }
    return { ok: false, error: msg };
  }
}
