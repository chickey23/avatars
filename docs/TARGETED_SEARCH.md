# Targeted multi-provider search

**Non-normative.** Personal / non-commercial use. The Tauri command runs **only in the Tauri desktop build** (not in the Vite browser dev server).

## Product surface (where to use it)

- **Context column → Internet tab** ([`ContextPanel.tsx`](../src/app/ContextPanel.tsx)): run a query, review hits, **select** rows, **Add selected to context**. Pinned lines live on `SituationContext.userInternetContextLines` and are **merged into `relevantData`** on each user turn (after connector blocks) in [`processUserTurn`](../src/store/appStore.ts).
- **Context depth (Internet)** — the slider when the Internet tab is active maps `contextEntryDepth.internet` (0–1) to **how many hits each Run requests** via [`resolveContextEntryBudgets`](../src/utils/contextEntryBudget.ts) → `internetSearchMaxResults` (1 at depth 0, up to 12 at full depth, clamped to 20 for the Tauri command).
- **Storage visualizer** ([`SourceCacheViz.tsx`](../src/components/SourceCacheViz.tsx)) is **only** for local cache / diagnostics / background contracts — it does **not** host search UI.

**Future agentic tool:** when wired, pass **`max_results: 1`** so avatars only retrieve a single hit per call unless product changes.

## Provider order (each query)

1. **Configured MediaWiki wikis** — `wikiBases` in config (e.g. Fandom roots). Uses each site’s `api.php` or `w/api.php` with a descriptive `User-Agent`.
2. **Wikipedia** — `{wikipediaLang}.wikipedia.org` (default `en`).
3. **Tavily** — only if `tavily.apiKey` is set; subject to `tavily.dailyCap` (default 50/day, UTC date bucket).
4. **Google Custom Search JSON API** — only if `google.apiKey` and `google.cx` are set; subject to `google.dailyCap` (default **100/day** — verify current quotas in [Google’s pricing docs](https://developers.google.com/custom-search/v1/overview)).

The orchestrator stops when it has collected up to the requested **max** hits (from Context depth in the UI, or from the caller for tools). Stable **`notices`** codes include `google_not_configured`, `google_daily_cap_reached`, `add_or_rotate_provider`, `no_hits_try_different_query_or_provider`. The Internet tab lists notices inline (no separate Storage banner).

## Files (platform data directory)

See [PLATFORM_PERSISTENCE.md](./PLATFORM_PERSISTENCE.md) for the base path (`%LOCALAPPDATA%\avatars\data\platform\` on Windows).

| File | Purpose |
|------|---------|
| `targeted_search_config.json` | Wiki list, API keys, daily caps |
| `targeted_search_usage.json` | Per-provider `{ day: "YYYY-MM-DD" (UTC), count }` |

Create `targeted_search_config.json` manually (or copy from the example below). The app creates `targeted_search_usage.json` on first search.

## Example `targeted_search_config.json`

```json
{
  "wikiBases": [
    "https://starwars.fandom.com",
    "https://memory-alpha.fandom.com"
  ],
  "wikipediaLang": "en",
  "tavily": {
    "apiKey": "",
    "dailyCap": 50
  },
  "google": {
    "apiKey": "YOUR_GOOGLE_CLOUD_API_KEY",
    "cx": "YOUR_PROGRAMMABLE_SEARCH_ENGINE_ID",
    "dailyCap": 100
  }
}
```

Field names use **camelCase** to match the deserializer.

## Google Custom Search setup

1. In [Google Cloud Console](https://console.cloud.google.com/), enable **Custom Search API** for a project and create an **API key** (restrict the key to Custom Search API when possible).
2. In [Programmable Search Engine](https://programmablesearchengine.google.com/), create a search engine (typically “Search the entire web” or specific sites you trust). Copy the **Search engine ID** (`cx`).
3. Put `apiKey` and `cx` into `google` in `targeted_search_config.json`.
4. Set `dailyCap` to at or below your quota. When the cap is reached (UTC day), further queries skip Google and return `google_daily_cap_reached`.

## Tavily (optional)

Sign up at [Tavily](https://tavily.com/), paste `apiKey` under `tavily`, and adjust `dailyCap` to match your plan.

## Pinned line format

See [EXTENDING_TRAITS_AND_RULES.md](./EXTENDING_TRAITS_AND_RULES.md) for the stable **`Internet context`** prefix used when formatting hits ([`internetContextLines.ts`](../src/services/internetContextLines.ts)).

## Tauri commands

- `targeted_search_query` — arguments: `query` (string), `max_results` (optional number, 1–20). Returns `{ hits, providersTried, notices }` (camelCase JSON in the response body).

- `wiki_extract_batch` — argument: `urls` (string array). Fetches **one** MediaWiki intro extract per URL via `action=query&prop=extracts&exintro=1&explaintext=1` (same HTTP client / user-agent as search). Only **Wikipedia** (`*.wikipedia.org` / `*.m.wikipedia.org` article URLs) and hosts listed under **`wikiBases`** in `targeted_search_config.json` are supported; other URLs return an item with `wiki_url_not_supported`. De-duplicates URLs, processes at most **5** unique URLs, truncates each extract to **80,000** Unicode scalars (notice `wiki_extract_truncated` when applied). Returns `{ extracts: [{ url, title, text, notices }] }`. Used by **Workshops → Creation → Use selected in new avatar** before a single Ollama JSON extraction; see [`avatarCreationFromWikiSources.ts`](../src/services/avatarCreationFromWikiSources.ts). Frontend: [`src/services/targetedSearch/wikiExtractInvoke.ts`](../src/services/targetedSearch/wikiExtractInvoke.ts).

The frontend wrapper for search is [`src/services/targetedSearch/invoke.ts`](../src/services/targetedSearch/invoke.ts).
