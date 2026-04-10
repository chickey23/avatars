# Handoff — Avatars (historical)

**For current queue and checklist, use [HANDOFF_TOMORROW.md](HANDOFF_TOMORROW.md) and [SPEC.md](SPEC.md).** Terminology: [docs/STYLEGUIDE.md](docs/STYLEGUIDE.md).

This file preserved the original **reply-provenance** write-up (Rules vs Ollama failure modes). That work **shipped**: tri-state Ollama, `ReplySource` / `fallback` / `rulesSkipReason` / `replyError`, prompt panels, session logging. Implementation touchpoints: `src/types/index.ts`, `src/services/avatarAgents.ts`, `src/services/ollama.ts`, `src-tauri/src/ollama.rs`, `src/App.tsx`, `switchboard.ts`, `appStore.ts`.

---

## Backlog pointer (superseded by SPEC)

Prior ordered notes (sync PROGRESS, context scoring, active task, metadata, connectors, WoS) are folded into **[SPEC.md](SPEC.md) § Implementation Order (Active)** and **[PROGRESS.md](PROGRESS.md)**.

**File map:** [TECHSPEC.md](TECHSPEC.md) § 2 Project Structure.

---

## Archive note

The original long-form doc (P0 problem/goal/sketch, backlog table, file map, session note) is **implemented** and was trimmed here. Recover verbatim text from version control if you need the historical write-up. When changing Ollama or reply UI, still **verify** Rules vs Fallback vs Ollama per message — do not assume “Rules” means template-only.
