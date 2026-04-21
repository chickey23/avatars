# Test plan (Avatars)

Use this for **regression before a release** or after large changes. Combine **automated** checks with **manual** flows that need Ollama, Gmail, or real UI.

## 1. Automated (every change)

```bash
npm run verify
```

Or: `npm run test -- --run` if you only need Vitest. The verify script also covers install/lock consistency per [scripts/verify.ps1](../scripts/verify.ps1).

**What it covers:** unit tests under `src/**/*.test.ts` (context scoring, pending notifications, waves queue, worldview parse diagnostics, `projectAvatarLink`, switchboard helpers, etc.).

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

1. `npm run verify`  
2. A3 + A5 + A7  
3. B1 or B2 once if you use world tools  
4. A9 if you care about audit revert  

Full depth: run the checklist in [HANDOFF_TOMORROW.md](../HANDOFF_TOMORROW.md) **Verification checklist** plus rows **A6–A8** above.
