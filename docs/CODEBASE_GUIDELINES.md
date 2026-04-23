# Codebase guidelines (non-normative)

Authoritative product behavior is in [SPEC.md](../SPEC.md). This document is for **implementation conventions** to keep the code easy to change and to avoid parallel or legacy patterns.

## Legacy naming: platform cache only

Durable Tauri file I/O for source snapshots, project store, and drafts uses the **`platform_cache`** Tauri module only. Do not reintroduce old codenames (e.g. “Empress”) or duplicate cache modules. See [PLATFORM_PERSISTENCE.md](PLATFORM_PERSISTENCE.md) for paths and command names.

## Tauri disk I/O: allowlist in two places

When adding a new on-disk file under the platform data directory:

1. Add the **exact filename** to `ALLOWED_FILENAMES` in [src-tauri/src/platform_cache.rs](../src-tauri/src/platform_cache.rs).
2. Align **logical names / storage keys** in [src/services/platform/constants.ts](../src/services/platform/constants.ts) and any TypeScript read/write path.

Readers must never observe partial JSON; the Rust side uses atomic write (`.tmp` + rename).

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

## App shell: `src/app/`

Major layout regions (header, sidebars, main chat) live under **`src/app/`** as presentational components. The orchestrating component (**`AppContent`**) may hold most local UI state; pass **grouped, typed prop objects** (e.g. `AppHeaderProps`, `PrimaryAvatarSidebarProps`) into region components instead of dozens of loose props.

## Web HTTP API (future)

The desktop app talks to **Tauri** commands, not a generic REST `fetch` client. A future web companion or backend would add an explicit client module; there is no stub to maintain until that exists.
