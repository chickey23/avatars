/**
 * Targeted multi-provider search (Tauri). See docs/TARGETED_SEARCH.md.
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI__" in window;
}

export type TargetedSearchHit = {
  title: string;
  url: string;
  snippet: string;
  source: string;
};

export type TargetedSearchResponse = {
  hits: TargetedSearchHit[];
  providersTried: string[];
  notices: string[];
};

/** Dev / browser: search runs only in the desktop shell. */
export const TAURI_ONLY_NOTICE = "tauri_only_targeted_search";

export async function runTargetedSearch(
  query: string,
  maxResults?: number
): Promise<TargetedSearchResponse> {
  const q = query.trim();
  if (!q) {
    return { hits: [], providersTried: [], notices: ["query_empty"] };
  }
  if (!isTauri()) {
    return {
      hits: [],
      providersTried: [],
      notices: [TAURI_ONLY_NOTICE],
    };
  }
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<TargetedSearchResponse>("targeted_search_query", {
    query: q,
    max_results: maxResults ?? null,
  });
}

/** Persistent banner: Google CSE missing or daily cap reached. */
export function shouldShowGoogleSearchBanner(notices: string[]): boolean {
  return notices.some(
    (n) => n === "google_daily_cap_reached" || n === "google_not_configured"
  );
}
