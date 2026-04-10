# Avatar Interface System — Progress & Spec Review

## TL;DR

- **Canonical order:** [SPEC.md](SPEC.md) § Implementation Order (Active).
- **Session handoff + checklist:** [HANDOFF_TOMORROW.md](HANDOFF_TOMORROW.md).
- **Shipped this cycle:** Email / calendar / **contacts** **user-turn** scoring ([`contextScoring/`](src/services/contextScoring/)); **world metadata** v1 JSON in `localStorage` ([`worldMetadata/`](src/services/worldMetadata/)) with debounced persist and contact scoring overlay; **proactive pending** MVP ([`pendingNotifications.ts`](src/services/pendingNotifications.ts) + types + [`App.tsx`](src/App.tsx) sidebar UX + short chat strip); **dev** verify (`scripts/verify.ps1`, `start-dev.cmd`, `build-release.cmd`); **Clear chat** without confirm; **context scoring** docs under [`docs/`](docs/CONTEXT_SCORING.md).
- **Next:** Proactive **sequential release** batch + timer/cue; Active Task / Focus Watcher; metadata **UI** / chat entry; Tauri file or SQLite backend when needed.
- **Context scoring docs:** [docs/CONTEXT_SCORING.md](docs/CONTEXT_SCORING.md) (overview + world metadata), [docs/CONTEXT_SCORING_EMAIL.md](docs/CONTEXT_SCORING_EMAIL.md), [docs/CONTEXT_SCORING_CALENDAR.md](docs/CONTEXT_SCORING_CALENDAR.md), [docs/CONTEXT_SCORING_CONTACTS.md](docs/CONTEXT_SCORING_CONTACTS.md).
- **Terminology:** [docs/STYLEGUIDE.md](docs/STYLEGUIDE.md). **Rebuild:** [TECHSPEC.md](TECHSPEC.md).

**Handoff history:** [HANDOFF.md](HANDOFF.md).

---

## Spec vs Implementation Status

### Data Sources and Connectors

| Spec Target | Status | Notes |
|-------------|--------|-------|
| Gmail (Email) | ✅ Done | OAuth, fetch recent, Context tab |
| Gmail (Calendar) | ✅ Done | Same OAuth, upcoming events |
| Google Contacts | ✅ Done | People API, Context tab |
| Hotmail | ❌ Not started | |
| Groundnews | ❌ Not started | User has account |
| Reddit | ❌ Not started | Several accounts |
| GitHub | ❌ Not started | Watching |
| Weather | ⚠️ Mock only | No real API yet |
| Boing Boing RSS | ❌ Not started | Public feed |

### Connector Rules (Spec § Data Sources)

| Rule | Status |
|------|--------|
| Read-only | ✅ |
| Toggleable (enable/disable) | ✅ `enabled/` vs `disabled/` |
| Credentials plain text local | ✅ `credentials.json` per source |
| Path structure | ✅ (app data; see Conflicts §5) |

### Switchboard Agent (Spec § Architecture)

| Function | Status |
|----------|--------|
| Data ingestion | ✅ `gatherDataFromSources()` |
| Tag / cascade routing | ✅ `evaluateRelevance()` + opinion matrix; `getRoutingLastMessage()` |
| Structured context scoring (per source) | ⚠️ Partial | Email, calendar, contacts ranked in user-turn prompts; overlay from world metadata |
| Distribution (reactive) | ✅ Queued turns in `AppContext` |
| Distribution (proactive) | ⚠️ MVP | `pendingNotifications.ts`, `userFocus`, interval + turn merge; per-avatar sidebar UI; release ids in prompt; **sequential release batch** not wired |
| Switchboard trace + turn archive | ✅ |

### Local LLM (Ollama)

| Spec / plan | Status | Notes |
|-------------|--------|-------|
| Optional in `avatarAgents` | ✅ | `getOllamaPresence`, `generateWithOllama` |
| Tri-state UI | ✅ | `no_server` / `no_models` / `ready` |
| Reply provenance + errors | ✅ | `ReplySource`, `replyError`, `rulesSkipReason` |
| Session log | ✅ | In-app + Tauri disk; zip at 100 files |

### Context scoring agents (Spec § Context scoring agents)

Order: email → calendar → contacts → others.

| Agent / scope | Status | Notes |
|---------------|--------|-------|
| Email | ⚠️ MVP | User-turn: `scoreAndFormatEmails`; proactive: `scoreAvatarsForNewEmail` |
| Calendar | ⚠️ MVP | User-turn: `scoreAndFormatCalendarEvents`; see [docs/CONTEXT_SCORING_CALENDAR.md](docs/CONTEXT_SCORING_CALENDAR.md) |
| Contacts | ⚠️ MVP | User-turn: `scoreAndFormatContacts` + overlay; [docs/CONTEXT_SCORING_CONTACTS.md](docs/CONTEXT_SCORING_CONTACTS.md) |
| Additional sources | ❌ | After connectors |

### Conversation archive & chat

| Spec | Status |
|------|--------|
| Compact turn records, view modes | ✅ |
| Queued turns, pending bar, incremental bubbles | ✅ |
| Clear chat (no confirm) | ✅ |
| Ephemeral `replyToUserMessageId`, cascade routing | ✅ |

### Situation Context

| Field | Status |
|-------|--------|
| Thread, recent events, relevant data, WoS opt-in | ✅ |
| `pendingNotifications`, `userFocus`, release ids (ephemeral) | ⚠️ MVP | SPEC § Proactive notifications |
| Active task / cues in types | ⚠️ UI partial; agents not wired per SPEC |
| Ephemeral `replyToUserMessageId` | ✅ |

### Shared Metadata

| Spec | Status |
|------|--------|
| `data/metadata/` (People, Dates, Events, Projects) | ⚠️ Partial | People-style fields in **world metadata** v1 (`localStorage`); SPEC path / Tauri file TBD |

### Behavioral Instructions for AI (Spec § Document Roles)

| Instruction | Status |
|-------------|--------|
| Spec-first, response style | ✅ |
| Tests | ⚠️ Vitest for email + pending helpers |
| Layout: consult user | ⚠️ Proactive sidebar UX iterated without formal sign-off |
| Signature phrase | ⚠️ Inconsistent |

### Dev tooling

| Item | Status |
|------|--------|
| `npm run verify` / `scripts/verify.ps1` | ✅ |
| `start-dev.cmd` (verify, kill port, Ollama, `tauri dev`) | ✅ |
| `build-release.cmd` | ✅ |
| `.local/` verify stamp + log (gitignored) | ✅ |

---

## Conflicts & Gaps (short)

1. **Focus vs Active Task** — Focus UI + `userFocus` for proactive; Active Task / Focus Watcher agents not implemented (SPEC).
2. **To Do List** — Header quick links; not in SPEC (enhancement).
3. **Shared metadata** — World metadata v1 in `localStorage` ([`worldMetadata/`](src/services/worldMetadata/)); SPEC `data/metadata/` path and Tauri file backend still open.
4. **Proactive distribution** — MVP live (pending queue + UI); **full** spec (timer/cue, sequential batch on release) still open.
5. **Credentials path** — Spec `data/connections/...` vs app data `%APPDATA%\com.avatars.app\...` (normal for desktop).

---

## Deferred — Clear chat vs archive, logs, compression

| Item | Status | Notes |
|------|--------|-------|
| Archive segment / dismiss topic | ❌ | SPEC § Conversation archive |
| Adjustable session-log cap | ❌ | Hard-coded 100; TECHSPEC § 12.7 |
| Semantic compression | ❌ | Turn archive / logs |
| Richer “essence” in records | ⚠️ Partial | Previews + trace |

---

## Recent milestone bullets

See **[HANDOFF_TOMORROW.md](HANDOFF_TOMORROW.md) § Completed this session** for the latest (SPEC proactive §, pending pipeline, sidebar UI, verify scripts, clear chat, tests).
