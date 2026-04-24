# Targeted multi-provider search

**Non-normative.** Personal / non-commercial use. Search runs **only in the Tauri desktop build** (not in the Vite browser dev server).

## Behavior

For each query, the app tries sources in order until it has enough results (default up to 8, max 20):

1. **Configured MediaWiki wikis** — `wikiBases` in config (e.g. Fandom roots). Uses each site’s `api.php` or `w/api.php` with a descriptive `User-Agent`.
2. **Wikipedia** — `{wikipediaLang}.wikipedia.org` (default `en`).
3. **Tavily** — only if `tavily.apiKey` is set; subject to `tavily.dailyCap` (default 50/day, UTC date bucket).
4. **Google Custom Search JSON API** — only if `google.apiKey` and `google.cx` are set; subject to `google.dailyCap` (default **100/day**, aligned with the common free-tier ballpark — verify current quotas in [Google’s pricing docs](https://developers.google.com/custom-search/v1/overview)).

If Google is missing or the daily cap is reached while more results are still needed, the command returns stable **`notices`** codes (e.g. `google_not_configured`, `google_daily_cap_reached`, `add_or_rotate_provider`). The Storage column **Search** chip surfaces a dismissible banner for the Google-specific notices.

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
4. Set `dailyCap` to at or below your quota. When the cap is reached (UTC day), further queries skip Google and return `google_daily_cap_reached`; the UI shows a banner until dismissed.

## Tavily (optional)

Sign up at [Tavily](https://tavily.com/), paste `apiKey` under `tavily`, and adjust `dailyCap` to match your plan.

## UI

Open **Storage viz** (right column) → **Search** chip: run queries, see providers tried, notices, and hit links.

## Tauri command

- `targeted_search_query` — arguments: `query` (string), `maxResults` (optional number, 1–20). Returns `{ hits, providersTried, notices }` (camelCase JSON).

The frontend wrapper is [`src/services/targetedSearch/invoke.ts`](../src/services/targetedSearch/invoke.ts).
