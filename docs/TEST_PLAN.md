# Test plan (Avatars)

Use this for **regression before a release** or after large changes. Combine **automated** checks with **manual** flows that need Ollama, Gmail, or real UI.

## 1. Automated (every change)

```bash
npm run verify
```

Or: `npm run test -- --run` if you only need Vitest. The verify script also covers install/lock consistency per [scripts/verify.ps1](../scripts/verify.ps1).

**What it covers:** unit tests under `src/**/*.test.ts` (context scoring, pending notifications, waves queue, worldview parse diagnostics, **golden `avatars_tools_v1` fixtures** under `src/services/worldviewTools/__fixtures__/modelReplies/`, tool prompt layout, mocked `runAvatarAgent` tool integration, `projectAvatarLink`, switchboard helpers, etc.).

## 2. Core UI / routing (no Gmail required)

| # | Scenario | Pass criteria |
|---|----------|----------------|
| A1 | Ollama **stopped** | Badge / copy reflects no server; replies use rules or fallback as designed. |
| A2 | Ollama **up, no models** | Tri-state shows “no models”; messaging sensible. |
| A3 | Ollama **ready** | Avatar replies show **Ollama** source; expand **Prompt sent to Ollama** → Full prompt present. |
| A4 | **Cascade** | Message that triggers two avatars in sequence; second sees first’s reply in thread behavior (smoke). |
| A5 | **Chat Visualizer** enabled | User tick + wave dots appear; waves settle after replies; no console errors. |
| A6 | **Unhelpful reply** | On an avatar bubble, button next to prompt toggle; click logs session entry; repeated clicks still OK. |
| A7 | **Model reply / tools parse** (expand prompt) | After a normal reply: section shows raw model text, parsed intent (or “none”), executed tools (or “none”). If model emits **bad** tool prose (no `avatars_tools_v1`), **Parse mismatch hints** list appears and session log gets `worldview_tools_parse_mismatch` (warn). |
| A8 | **Waves — parse warning** | With malformed tool output: orange **!** worldview tick, tooltip mentions parse; scroll-to-turn still works. |
| A9 | **WV log** tab | Entries list tool results; **Revert bad patches** only on rows with revert data; confirm dialog; projects/profile refresh. |
| A10 | **Clear chat** | Thread clears; waves queue resets (per session log note). |
| A11 | **Waves — denied / failed tool** (optional) | When the model returns tools but execution fails (e.g. `permission_denied`, `permission_denied_projects`), you can determine **which tool** and **why** via **Waves** tooltip, **Model reply / tools parse**, and/or **WV log**; after [PROGRESS.md](../PROGRESS.md) “Operability” work, the column should show **error code** and **non-secret arg preview** without relying on the session log alone. |
| A12 | **Audio + visual cue** (optional) | A cue that plays sound also produces a **visible** pulse (e.g. `audio-visual-cue-active` on the main region or a column) unless **focus mode** / **reduced motion** / a documented exception applies. |
| A13 | **User chrome color by window style** | Pick a **You** color in one **Window** style, switch to another style and pick a different color, then switch back and reload; each style keeps its own user-message / Chat Visualizer user marker color. Legacy `avatars_user_chrome_color` should seed the default fallback. |

## 3. Structured tools & world metadata (Ollama required)

| # | Scenario | Pass criteria |
|---|----------|----------------|
| B1 | Valid **`avatars_tools_v1`** block | Project or profile updates; **WV log** row with ok tools; optional: **Waves** ◆ (not !). |
| B2 | **Project from avatar** | After `world_metadata.patch_projects`, project appears in **Projects** context tab; **long-term task** created for that avatar; assign-task dropdown / task list refresh (same session). |
| B3 | **Informal tool dump** (optional torture) | Prose like `user profile.patch:` without proper JSON → hints + log warn + **!** in visualizer; no silent failure. |

## 4. Gmail / connectors (optional)

| # | Scenario | Pass criteria |
|---|----------|----------------|
| C1 | Gmail connected | Email lines in relevant context; focus email → body or snippet path. |
| C2 | **`gmail.fetch_message_body`** | Only ids from loaded inbox succeed; follow-up pass if tool used (see [WORLD_MODEL_AND_PREPROCESSOR.md](WORLD_MODEL_AND_PREPROCESSOR.md)). |

## 5. Tauri-only (optional)

| # | Scenario | Pass criteria |
|---|----------|----------------|
| D1 | Session log disk | Entries appear under app log dir (see TECHSPEC / session log). |
| D2 | `world_metadata` disk | Hydrate from disk when implemented; no crash on empty file. |

## 6. Quick smoke order (5–10 min)

1. `npm run verify` (if you use [`start-dev.cmd`](../start-dev.cmd) without `SKIP_VERIFY=1`, you already ran verify on that launch; still run it yourself before merge if you need an explicit pass after edits.)  
2. A3 + A5 + A7  
3. B1 or B2 once if you use world tools  
4. A9 if you care about audit revert  
5. A11 and/or A12 if you touched **Waves** / **permissions** / **audio** paths  
6. A13 if you touched chat chrome or window-style persistence  

Full depth: run the checklist in [HANDOFF_TOMORROW.md](../HANDOFF_TOMORROW.md) **Verification checklist** plus rows **A6–A8** and (when relevant) **A11–A12** above.
