# Codebase guidelines (non-normative)

Authoritative product behavior is in [SPEC.md](../SPEC.md). This document is for **implementation conventions** to keep the code easy to change and to avoid parallel or legacy patterns.

## Legacy naming: platform cache only

Durable Tauri file I/O for source snapshots, project store, and drafts uses the **`platform_cache`** Tauri module only. Do not reintroduce old codenames (e.g. “Empress”) or duplicate cache modules. See [PLATFORM_PERSISTENCE.md](PLATFORM_PERSISTENCE.md) for paths and command names.

## Tauri disk I/O: allowlist (shared crate + TypeScript + doc)

When adding a new on-disk file under the platform data directory:

1. Add the **exact filename** to `ALLOWED_FILENAMES` in [crates/avatars-platform-storage/src/lib.rs](../crates/avatars-platform-storage/src/lib.rs) (single source of truth for path resolution and read/write).
2. Align **logical names / storage keys** in [src/services/platform/constants.ts](../src/services/platform/constants.ts) and every TypeScript read/write path.
3. Add a row to [docs/PLATFORM_PERSISTENCE.md](PLATFORM_PERSISTENCE.md). The Vitest contract [platformPersistenceDocContract.test.ts](../src/services/platform/platformPersistenceDocContract.test.ts) enforces alignment.

Readers must never observe partial JSON; the Rust side uses atomic write (`.tmp` + rename).

## Read-only companion (second binary)

The **Companion App** ([`src/viewer/`](../src/viewer/), `viewer-tauri/`) is a **separate** desktop binary for offline library browsing and read-only inspection of shared files. It registers **read-only** Tauri commands: `platform_cache_read`, `platform_cache_dir_display`, `world_metadata_read`, `world_metadata_dir_display` (no `platform_cache_write` / `world_metadata_write`). Reuse the same on-disk path story as the main app. Product scope and `localStorage` limitations: [READONLY_COMPANION.md](READONLY_COMPANION.md).

## React context: `app-context` vs `AppProvider`

| File | Role |
|------|------|
| [src/context/app-context.ts](../src/context/app-context.ts) | `AppContextValue` type, `AppContext` from `createContext`, and related option types. |
| [src/context/AppProvider.tsx](../src/context/AppProvider.tsx) | `AppProvider` component: wires store, platform, waves queue, and renders `<AppContext.Provider>`. |

The **object** from `useContext(AppContext)` is the app’s public API. Comments that refer to “the provider” mean **`AppProvider`**, not the `AppContext` object name.

## Imports: relative paths

Use **relative** imports (e.g. `../services/...`) from the importing file. The `@/*` path alias is not configured; do not add one unless the team adopts it project-wide and tooling is updated.

## `services/platform` barrel

[platform/index.ts](../src/services/platform/index.ts) re-exports many modules. It is useful for app wiring. For a narrow dependency (e.g. only the event bus), import from the **specific submodule** (e.g. `./bus`) to avoid circular import issues and to make ownership obvious.

## Tests

- **Framework:** Vitest ([package.json](../package.json) `npm test`).
- **Placement:** colocated `*.test.ts` next to the code under test.

## Avatar Ollama prompts and structured tools

- **Entry point:** [`avatarAgents.ts`](../src/services/avatarAgents.ts) — `runAvatarAgent`, `buildOllamaPrompt` (exported for tests), transcript scrub, optional tool-parse **repair** pass (second Ollama call).
- **Tool contract text:** [`agenticTools/toolProtocol.ts`](../src/services/agenticTools/toolProtocol.ts) — `resolveToolProfile`, `renderToolProtocol`, `FULL_GENERAL_WORLDVIEW_TOOL_INSTRUCTIONS`; permissions in [`agenticTools/registry.ts`](../src/services/agenticTools/registry.ts) (`avatarMayUseAgenticTool`, `TOOL_GROUPS`). Re-exports: [`agenticTools/index.ts`](../src/services/agenticTools/index.ts).
- **Intent heuristics:** [`turnToolIntent.ts`](../src/services/turnToolIntent.ts) (user message → intent for profile, closing line, repair gating, telemetry).
- **Model-only transcript:** [`modelTranscript.ts`](../src/services/modelTranscript.ts) — redacts lines that would teach bad tool prose.
- **Parse / execute:** [`worldviewTools/parse.ts`](../src/services/worldviewTools/parse.ts), [`worldviewTools/execute.ts`](../src/services/worldviewTools/execute.ts), [`worldviewTools/diagnose.ts`](../src/services/worldviewTools/diagnose.ts).
- **Docs:** [AGENTIC_TOOLS.md](AGENTIC_TOOLS.md), [TOOL_WORKSHOP.md](TOOL_WORKSHOP.md).

## App shell: `src/app/`

Major layout regions (header, sidebars, main chat) live under **`src/app/`** as presentational components. The orchestrating component (**`AppContent`**) may hold most local UI state; pass **grouped, typed prop objects** (e.g. `AppHeaderProps`, `PrimaryAvatarSidebarProps`) into region components instead of dozens of loose props.

## Web HTTP API (future)

The desktop app talks to **Tauri** commands, not a generic REST `fetch` client. A future web companion or backend would add an explicit client module; there is no stub to maintain until that exists.
