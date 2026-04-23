---
name: avatars-capability-smoke
description: >-
  Runs automated tests via npm run verify, then guides a short manual smoke of
  the Tauri app or Vite dev server. Use after substantive changes under src/,
  src-tauri/, src/services/audio/, or src/app/; before merge or PR; when the
  user requests a smoke test, regression check, or capability verification.
---

# Avatars capability smoke

## When to use

- After substantive refactors or feature work in the **frontend shell**, **Switchboard/chat**, **audio**, **Tauri/Rust**, or **platform** code.
- Before merge or when the user asks to verify nothing regressed.
- **Skip** a full manual pass for **docs-only** or **comment-only** changes unless the user wants otherwise.

## Instructions

### Step 1 — Automated

From the repo root:

1. Run `npm run verify` (see `package.json` and `scripts/verify.ps1`). This conditionally runs `npm install` when the lockfile or `package.json` changed, then `vitest run`.
2. If verify fails, **stop** and fix tests or install issues before any manual smoke.

`SKIP_VERIFY=1` is only for the local **start** script path (`start-dev.cmd` / skipping verify when launching daily dev). **Do not** use it to skip `npm run verify` before merge.

### Step 2 — Launch the app

- **Default (full):** run the **desktop** app so the Tauri shell and web UI both run. Use `npm run tauri dev` or `start-dev.cmd` (see `README.md — Getting Started`). This is the right default when `src-tauri/`, Tauri commands, or platform bridges might be affected.
- **Narrow (web only):** `npm run dev` (Vite) is acceptable only when the change is provably **web-only** and does **not** touch `src-tauri/`, Tauri commands, or `src/services/platform/` in a way that needs the native shell. If unsure, use Tauri.

### Step 3 — Manual checklist (about 5–10 minutes)

Work top to bottom. Skip a bullet if that area was not touched, except **app load** and **chat** — always spot-check those on a full merge candidate.

1. **Load** — App window (or browser for Vite-only) opens without obvious startup failure.
2. **Chat** — Send at least one user message; confirm the thread updates (core user → Switchboard → avatar path; see `SPEC.md`).
3. **Avatars / layout** — Default primary avatars and main regions render; shell lives under `src/app/` (see `docs/CODEBASE_GUIDELINES.md`). Default avatars are listed in `README.md` (e.g. The Muse, The Accomplice, The Skeptic).
4. **View / context** (if you changed panels or routing UI) — Spot-check the View control: Chat, Chat + routing, Routing + log per `SPEC.md`; exercise any context panel you modified.
5. **Audio** (if you changed `src/services/audio/`, bus, or cues) — Confirm the sound path still fires for a simple action; cue assets and notes live under `public/audio/` — see `public/audio/README.md` if present.
6. **Tauri / disk** (if you changed `src-tauri/` or `src/services/platform/`) — Spot-check **one** persistence or platform path (e.g. that platform cache or session logging still behaves) using `docs/PLATFORM_PERSISTENCE.md` and `src/services/platform/constants.ts` for filenames and commands. One command or one read/write path is enough; not a full audit.

### On failure

Record **which step** failed (verify vs. launch vs. which checklist line). If you only ran **Vite** and a failure might be Tauri-only, re-run a **Tauri** session before merge. Open or update an issue, fix, and re-run from Step 1.

## Example

**User:** "Ready to merge the audio bus refactor; quick smoke?"

1. `npm run verify`
2. `npm run tauri dev` (audio + platform may interact with the desktop shell)
3. Confirm app load, send one chat line, then trigger or exercise one path that should play a cue; if anything fails, note the step and fix before merge.
