---
name: avatars-companion-app
description: >-
  Explains the Avatars Companion App (second Tauri binary): offline Library tab,
  My data / Raw files (read-only disk), dev commands, key source paths, and how it
  differs from the main chat app. Use when the user asks about the companion,
  viewer, avatars-viewer, Library/My data tabs, or read-only platform/world
  metadata inspection.
---

# Avatars Companion App

## What it is (and is not)

- **Companion App** = second desktop process (`com.avatars.app.viewer`), window title **Companion App**, product name **Avatars Companion**. Binary: `avatars-viewer` / `avatars-viewer.exe` under `target/debug/` (not `avatars.exe`).
- **Purpose:** Offline **Library** (bundled reference: worldview tool ids, AI rules, traits, default avatars, project seed list) plus **read-only** views of the same on-disk stores the main app uses.
- **Not:** A mirror of the main React chat shell. No Gmail, no Ollama chat, no editing stores from the Companion.

## UI tabs

| Tab | Needs Tauri? | Content |
|-----|----------------|--------|
| **Library** | No | Bundled modules only; works in `npm run dev:viewer`. |
| **My data** | Yes | Parsed `world_metadata.json` + `platform_store.json` (paths shown). Browser shows gating copy. |
| **Raw files** | Yes | Allowlisted platform JSON, pretty-printed (`platform_cache_read`). |

Entry: [viewer.html](../../viewer.html) → [src/viewer/main.tsx](../../src/viewer/main.tsx) → [src/viewer/ViewerApp.tsx](../../src/viewer/ViewerApp.tsx). Panels: [CompanionLibrary.tsx](../../src/viewer/CompanionLibrary.tsx), [CompanionLocalData.tsx](../../src/viewer/CompanionLocalData.tsx), [RawPlatformJsonPanel.tsx](../../src/viewer/RawPlatformJsonPanel.tsx).

## Run commands (repo root)

| Command | Result |
|---------|--------|
| `npm run tauri:dev:viewer` | Vite **5174** + Tauri; must build **`cd viewer-tauri && tauri dev`** so Cargo targets **avatars-viewer**, not the main `avatars` crate (see [package.json](../../package.json)). |
| `npm run dev:viewer` | Library-only in browser: `http://localhost:5174/viewer.html` |
| `npm run tauri:build:viewer` | `dist-viewer/` + production bundle |

## Read-only Tauri IPC (Companion)

Implemented in [viewer-tauri/src/lib.rs](../../viewer-tauri/src/lib.rs):

- `platform_cache_read`, `platform_cache_dir_display` (shared crate [crates/avatars-platform-storage](../../crates/avatars-platform-storage))
- `world_metadata_read`, `world_metadata_dir_display` (same paths as main app; **no** write commands)

Main app write paths for comparison: [src-tauri/src/platform_cache.rs](../../src-tauri/src/platform_cache.rs), [src-tauri/src/world_metadata.rs](../../src-tauri/src/world_metadata.rs).

## Data locations (desktop)

- Platform JSON: `%LOCALAPPDATA%/avatars/data/platform/` (filenames in [src/services/platform/constants.ts](../../src/services/platform/constants.ts), allowlist in Rust).
- World metadata: `.../avatars/data/metadata/world_metadata.json`.

Companion does **not** read main-app `localStorage`; disk is the source of truth for **My data** when the main app has hydrated Tauri.

## Docs

- Canonical product write-up: [docs/READONLY_COMPANION.md](../../docs/READONLY_COMPANION.md)
- Platform table: [docs/PLATFORM_PERSISTENCE.md](../../docs/PLATFORM_PERSISTENCE.md)

## Troubleshooting (for agents helping users)

- **Port 5174 in use:** Stop the other Vite process or pick a free port (viewer [vite.config.viewer.ts](../../vite.config.viewer.ts) uses `strictPort: true`).
- **`avatars.exe` access denied during `tauri:dev:viewer`:** Dev script was building the **wrong** crate; ensure [package.json](../../package.json) uses `cd viewer-tauri && tauri dev` so only **avatars-viewer** links.
- **My data empty:** Main Avatars may not have written `world_metadata.json` yet, or user is in browser-only dev without Tauri.

## Related

- Changing Companion UI: follow patterns in `src/viewer/`; keep dependency imports minimal.
- After substantive changes to `src/viewer/` or `viewer-tauri/`, consider [.cursor/skills/avatars-capability-smoke/SKILL.md](../avatars-capability-smoke/SKILL.md); `npm run verify` runs `cargo check -p avatars-viewer` (see [scripts/verify.ps1](../../scripts/verify.ps1)).
