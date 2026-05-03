# Companion App (read-only second process)

**Non-normative.** The **Companion App** is a second desktop bundle (`com.avatars.app.viewer`) that shares the same on-disk stores as **Avatars** for **read-only** inspection. It is **not** a mirror of the main chat UI: it is an **offline library browser** (bundled rules, traits, tool registry, defaults, project seed list) plus **My data** (structured read-only views of world metadata and the platform store) and an optional **Raw files** JSON inspector.

Authoritative allowlist for platform JSON: [`crates/avatars-platform-storage/src/lib.rs`](../crates/avatars-platform-storage/src/lib.rs). TypeScript mirrors filenames in [`src/services/platform/constants.ts`](../src/services/platform/constants.ts). The summary table is in [PLATFORM_PERSISTENCE.md](PLATFORM_PERSISTENCE.md). Main-app Tauri commands remain in [`src-tauri/src/platform_cache.rs`](../src-tauri/src/platform_cache.rs) and [`src-tauri/src/world_metadata.rs`](../src-tauri/src/world_metadata.rs).

## Goals

- Run a **separate executable** so you can browse reference material offline and inspect on-disk JSON while the primary app is not running or is mid-update.
- **Companion IPC (read-only):** `platform_cache_read`, `platform_cache_dir_display`, `world_metadata_read`, `world_metadata_dir_display` — see [`viewer-tauri/src/lib.rs`](../viewer-tauri/src/lib.rs). No `platform_cache_write`, no `world_metadata_write`; no shell plugin in the companion build.
- **Same paths** as the main app: platform data under `data_local_dir/avatars/data/platform/`, world metadata file `.../avatars/data/metadata/world_metadata.json`.

## UI (web + Tauri)

| Tab | Behavior |
|-----|----------|
| **Library** | Always available: bundled worldview tool ids, AI rules, traits, default avatars, project seed list — no network. |
| **My data** | **Tauri only:** read-only views of `world_metadata.json` (user profile, projects, people, **knowledge sets** from set discovery) and `platform_store.json`. In the Vite dev server without Tauri, the tab explains how to launch the desktop companion. |
| **Raw files** | **Tauri only:** allowlisted platform JSON, pretty-printed (same as the legacy single-screen viewer). |

Front-end code: [`src/viewer/`](../src/viewer/) (`ViewerApp.tsx` and friends).

## Run and build

From the repository root (npm dependencies installed):

| Command | Purpose |
|---------|---------|
| `npm run tauri:dev:viewer` | Vite on port **5174** + Tauri dev shell for the **Companion App** (window title “Companion App”) |
| `npm run dev:viewer` | Web UI only (no Tauri): **Library** works; **My data** and **Raw files** are gated. |
| `npm run tauri:build:viewer` | Production build: `npm run build:viewer` (Vite → `dist-viewer/`) then Tauri bundle for `com.avatars.app.viewer` |

`npm run verify` runs Vitest and `cargo check -p avatars-viewer`.

## What is shared vs not

| Store | Available in Companion? |
|-------|------------------------|
| Platform JSON under `platform_data_dir()` | **Yes** (read via `platform_cache_read`). |
| `world_metadata.json` under `.../data/metadata/` | **Yes** (read via `world_metadata_read`). |
| `localStorage` keys from `constants.ts` | **No** — per app profile. |
| Gmail OAuth (main app) | **Not** used by the companion. |

## Concurrency and updates

- Writes in the main app use **atomic replace** (`.tmp` + `rename`), so readers should not see truncated JSON; they may see the **previous** snapshot briefly.
- While an **installer** replaces a binary or migrates files, reads may fail (missing file, transient error). The companion surfaces errors in the UI.

## Drift checks

Adding a platform filename requires updating `ALLOWED_FILENAMES` in the shared crate, TypeScript constants, and [PLATFORM_PERSISTENCE.md](PLATFORM_PERSISTENCE.md). [platformPersistenceDocContract.test.ts](../src/services/platform/platformPersistenceDocContract.test.ts) fails if those sources diverge.
