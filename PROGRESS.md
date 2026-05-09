# Avatar Interface System — Progress & Spec Review

## TL;DR

- **Canonical order:** [SPEC.md](SPEC.md) `SPEC-IMPLEMENTATION-ORDER` (Implementation Order (Active)).
- **Phased roadmap (A–G: viz, metadata, execution, bench, popularity, archive):** [docs/IMPLEMENTATION_ROADMAP.md](docs/IMPLEMENTATION_ROADMAP.md).
- **Session handoff + checklist:** [HANDOFF_TOMORROW.md](HANDOFF_TOMORROW.md).
- **Test plan:** [docs/TEST_PLAN.md](docs/TEST_PLAN.md). **Open regressions:** [§ Reported issues (open)](#reported-issues-open) below (not the same as **Deferred**). **Design / dev cycle (plan → use → reflect) + Cursor context:** [docs/DEVELOPMENT_CYCLE.md](docs/DEVELOPMENT_CYCLE.md). **Agentic tools:** [docs/AGENTIC_TOOLS.md](docs/AGENTIC_TOOLS.md) (JSON + lexical lines, permissions, single-wave routing).
- **Shipped this cycle:** [docs/CODEBASE_GUIDELINES.md](docs/CODEBASE_GUIDELINES.md); React shell split under [`src/app/`](src/app/) (region components + `useAppContentModel` + `AppContentViewProvider`); top-level app state in [`AppProvider.tsx`](src/context/AppProvider.tsx) (replaces the old `AppContext` filename); Vite 8, `@vitejs/plugin-react` 6, Vitest. **Also shipped (prior sessions):** Email / calendar / **contacts** **user-turn** scoring ([`contextScoring/`](src/services/contextScoring/)); **world metadata** v1 JSON in `localStorage` ([`worldMetadata/`](src/services/worldMetadata/)) with debounced persist and contact scoring overlay; **proactive pending** MVP ([`pendingNotifications.ts`](src/services/pendingNotifications.ts) + types + [`App.tsx`](src/App.tsx) sidebar UX: **Discuss** sends a user turn with forced cluster release and clears that cluster from pending after the turn; **Dismiss** drops one row); **dev** verify (`scripts/verify.ps1`, `start-dev.cmd`, `build-release.cmd`); **Clear chat** without confirm; **context scoring** docs under [`docs/`](docs/CONTEXT_SCORING.md); **Chat Visualizer / Waves** — persistent queue ([`switchboardWavesQueue/`](src/services/switchboardWavesQueue/)), optional resizable column, avatar-accent dots + user-chrome tick, rise animation (`SWITCHBOARD_WAVE_TRAVEL_MS`), per-wave blink until that wave’s replies appear (`onWaveChatComplete` → [`markWaveSettledForUserDepth`](src/services/switchboardWavesQueue/operations.ts)); UI [`SwitchboardViz.tsx`](src/components/SwitchboardViz.tsx); [`docs/SWITCHBOARD_VISUALIZATION.md`](docs/SWITCHBOARD_VISUALIZATION.md). **Structured worldview tools** — `avatars_tools_v1` JSON from Ollama ([`avatarAgents.ts`](src/services/avatarAgents.ts), [`worldviewTools/`](src/services/worldviewTools/)); **parse diagnostics** ([`diagnose.ts`](src/services/worldviewTools/diagnose.ts)), session log on mismatch, in-prompt **Model reply / tools parse** panel, **Waves** warn marker (`!`); **WV audit** with revertible patches + **Revert bad patches** UI; **project patches → long-term task** + avatar assignment ([`projectAvatarLink.ts`](src/services/projectAvatarLink.ts)); **routing downvote** ([`avatarPopularity.ts`](src/services/avatarPopularity.ts)); **Gmail fetch allowlist** = full loaded inbox snapshot for the turn; **Ollama relevant-data** preserves ranked email id lines ([`relevantContextPrompt.ts`](src/services/relevantContextPrompt.ts)). **Manual + automated test guide:** [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md). **Switchboard:** optional **`single_wave`** mode ([`switchboard.ts`](src/services/switchboard.ts)) — one responder wave per call (no cascade); **`AVATARS_NO_COMMENT`** hides empty participation ([`avatarAgents.ts`](src/services/avatarAgents.ts)); optional **preflight** (set `preflightOllamaMinScore` on the turn context) skips Ollama when [`getRoutingScoreForAvatar`](src/services/routingScore.ts) is below that threshold. **Lexical tools** [`AVATARS_MEM:`](src/services/agenticTools/lexicalParse.ts) / Gmail line form + **`allowedAgenticToolIds`** on [`Avatar`](src/types/index.ts).
- **Tag-driven monitors & background contracts:** [`Avatar.systemTags`](src/types/index.ts) (`system`, `tool_owner:<group>`, `monitor:<name>`); registry + drivers in [`services/monitors/`](src/services/monitors/) (e.g. unassigned projects, unclaimed-contract warnings, source-runner / scheduler **contract** stubs); synthetic chat lines via [`postSynthetic.ts`](src/services/monitors/postSynthetic.ts) with **Waves** [`monitor_prompt`](src/services/switchboardWavesQueue/types.ts) rows; structured logging [`contractLog`](src/services/sessionLog/contractLog.ts) (`contract:<name>__<event>`) for runners/scheduler; **Storage viz** right column — **Background** chip + per-contract claimant rows + log tail in [`SourceCacheViz.tsx`](src/components/SourceCacheViz.tsx). **Draft tools:** `drafts.tasks`, `drafts.calendar_event`, `drafts.email_reply` ([`agenticTools/registry.ts`](src/services/agenticTools/registry.ts), [`worldviewTools/execute.ts`](src/services/worldviewTools/execute.ts)). **Projects hygiene:** [`projectSeedList.ts`](src/data/projectSeedList.ts), [`titleSanity.ts`](src/services/worldMetadata/titleSanity.ts), startup prune/seed in [`AppProvider.tsx`](src/context/AppProvider.tsx). Durable project/task state lives in [`platform/store.ts`](src/services/platform/store.ts) under [`services/platform/`](src/services/platform/); it still uses a **single** [`ownerAvatarId`](src/services/platform/store.ts) per project/task row (steward for scheduler + context block); assignment UX and UPM continue to interact with that model. **Tauri** disk I/O uses `platform_cache_*` and `%LOCALAPPDATA%/.../data/platform/` ([`docs/PLATFORM_PERSISTENCE.md`](docs/PLATFORM_PERSISTENCE.md)).
- **Shipped 2026-04-26:** **Workshops hub** now includes Tool, Unmet Needs, Source, Projects, Creation, and **Stewardship** tabs ([`docs/WORKSHOPS.md`](docs/WORKSHOPS.md), [`WorkshopsPanel.tsx`](src/components/WorkshopsPanel.tsx)); **Stewardship Workshop** can reassign monitor duties and tool capability owners without editing raw tags ([`StewardshipWorkshopPanel.tsx`](src/components/StewardshipWorkshopPanel.tsx), [`avatarOperations.ts`](src/services/avatarOperations.ts)); avatar details and builder now show **Match / Bio / Rules**, assigned projects, operational roles, and editable portraits with crop/zoom stored on [`SituationContext`](src/types/index.ts) ([`PrimaryAvatarSidebar.tsx`](src/app/PrimaryAvatarSidebar.tsx), [`AvatarBuilderModal.tsx`](src/components/AvatarBuilderModal.tsx), [`avatarPortrait.ts`](src/services/avatarPortrait.ts)); project assignment now writes through to platform stewardship (`ownerAvatarId`), dedupes active long-term tasks, completes stale assignments, and injects a focused project block into relevant data ([`projectAvatarLink.ts`](src/services/projectAvatarLink.ts), [`longTermTasks.ts`](src/services/longTermTasks.ts), [`platform/projectBlock.ts`](src/services/platform/projectBlock.ts)); platform project/task rows carry workflow fields, due/snooze, next actor, required capability, blockers, evidence, and history ([`platform/store.ts`](src/services/platform/store.ts)); obsolete header **To Do List** controls were removed.
- **Next (priority order):** **Complex task handling / project execution** on top of the world model — start with deterministic monitor cards and typed plans. Projects are the durable goal/context container; Tasks are the execution grain. A request like “create three named avatars” should become one project plus three avatar-creation tasks routed by capability/stewardship, with blockers, approval, completion evidence, and telemetry when a tool is used incorrectly; a fuzzy request like “create avatars for the main crew of Firefly” should first discover and review the candidate set before task creation. Ollama remains available as fallback/enrichment for fuzzy planning or avatar suggestions, not the default gate before lexical splits, review cards, or task creation ([`docs/WORLD_MODEL_AND_PREPROCESSOR.md`](docs/WORLD_MODEL_AND_PREPROCESSOR.md), [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md)). In parallel, improve **search-result-driven avatar creation** so named-avatar form fields are filled from better field-specific searches, follow-up queries, source evidence, and confidence. Then continue SPEC `data/metadata/` / durable backing, Active Task / Focus Watcher, and **Conversation archive** segments/chapters. **Proactive:** timer/cue; **sequential release batch** polish **deprioritized** (MVP acceptable).
- **Operating grammar:** Use [docs/STYLEGUIDE.md](docs/STYLEGUIDE.md) § Avatar operating grammar — descriptors, instructions, capabilities, stewardships, plan steps, and tool calls are distinct. Prefer success conditions and eligibility gates over negative “do / don’t” commands. Current GUI copy to revisit opportunistically: **No JSON tools**, **Permission denied**, **Unhelpful reply**, **Dismiss**, and **Skip**.
- **Operability (parallel; does not block SPEC implementation order #1):** (1) ✅ **User chrome** — **“You” / user** chat chrome color now persists per **chat window style** via `avatars_user_chrome_color_by_skin`, with legacy `avatars_user_chrome_color` migrated as the default fallback ([`appChromeConstants.ts`](src/app/appChromeConstants.ts) / [`useAppContentModel.ts`](src/app/useAppContentModel.ts)). (2) **Clear chat vs End topic** — product choice: **compose** one control that both clears the thread and appends a topic segment, or keep separate actions with clear copy (ties to **Conversation archive**; see [HANDOFF_TOMORROW.md](HANDOFF_TOMORROW.md)). (3) **Waves + permissions** — enrich **Chat Visualizer** rows with **tool name**, **error code** (e.g. `permission_denied`, `permission_denied_projects`), and **non-secret arg preview** (align with `formatWorldviewToolArgsForAudit` / WV audit; policy fix remains **`allowedAgenticToolIds`** on [`Avatar`](src/types/index.ts) and [docs/AGENTIC_TOOLS.md](docs/AGENTIC_TOOLS.md)). (4) **Audio + visual** — primary cues should pair **audible** output with `emitAudioVisualCue` (see [`audioDirector.ts`](src/services/audio/audioDirector.ts), [`audioVisualBus.ts`](src/services/audio/audioVisualBus.ts), [`ChatMainPanel.tsx`](src/app/ChatMainPanel.tsx)); strengthen pulse duration/visibility, `focusMode` / **reduced motion**, and **anchor** when optional columns are hidden.
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
| Reddit | ❌ Not started | Several accounts; supplemental / avatar research (deferred) |
| Wikipedia | ❌ Not started | Reference; supplemental for avatar creation (deferred) |
| Wookieepedia | ❌ Not started | Star Wars wiki; supplemental (deferred) |
| Memory Alpha | ❌ Not started | Star Trek wiki; supplemental (deferred) |
| GitHub | ❌ Not started | Watching |
| Weather | ⚠️ Mock only | No real API yet |
| Boing Boing RSS | ❌ Not started | Public feed |

### Connector Rules (Spec Data Sources)

| Rule | Status |
|------|--------|
| Read-only | ✅ |
| Toggleable (enable/disable) | ✅ `enabled/` vs `disabled/` |
| Credentials plain text local | ✅ `credentials.json` per source |
| Path structure | ✅ (app data; see Conflicts §5) |

### Switchboard Agent (Spec Architecture + `SPEC-CONTEXT-SCORING` / `SPEC-PROACTIVE-NOTIFY`)

| Function | Status |
|----------|--------|
| Data ingestion | ✅ `gatherDataFromSources()` |
| Tag / cascade routing | ✅ `evaluateRelevance()` + opinion matrix; `getRoutingLastMessage()` |
| Structured context scoring (per source) | ⚠️ MVP + roadmap | User-turn (+ proactive) paths match SPEC **MVP**; dedicated **background** runners and evolved mechanisms per `SPEC-CONTEXT-SCORING` |
| Distribution (reactive) | ✅ Queued turns in `AppProvider` / `useApp()` |
| Distribution (proactive) | ⚠️ MVP | `pendingNotifications.ts`, `userFocus`, interval + turn merge; per-avatar sidebar UI; token + **Discuss** forced release; pending cleared after released turn; **sequential release batch** polish **lower priority** (acceptable for now) |
| Switchboard trace + turn archive | ✅ |
| Switchboard visualization (ambient wave/bubbles) | ✅ Done | Queue + [`SwitchboardViz.tsx`](src/components/SwitchboardViz.tsx); `onWaveChatComplete` / [`markWaveSettledForUserDepth`](src/services/switchboardWavesQueue/operations.ts); [`docs/SWITCHBOARD_VISUALIZATION.md`](docs/SWITCHBOARD_VISUALIZATION.md) |

### Local LLM (Ollama)

| Spec / plan | Status | Notes |
|-------------|--------|-------|
| Optional in `avatarAgents` | ✅ | `getOllamaPresence`, `generateWithOllama` |
| Tri-state UI | ✅ | `no_server` / `no_models` / `ready` |
| Reply provenance + errors | ✅ | `ReplySource`, `replyError`, `rulesSkipReason` |
| Session log | ✅ | In-app + Tauri disk; zip at 100 files |

### Context scoring agents (Spec `SPEC-CONTEXT-SCORING`)

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
| Thread, recent events, relevant data, WoS draft when non-empty | ✅ |
| `pendingNotifications`, `userFocus`, release ids (ephemeral) | ⚠️ MVP | Spec `SPEC-PROACTIVE-NOTIFY` |
| Active task / cues in types | ⚠️ UI partial; agents not wired per SPEC |
| Ephemeral `replyToUserMessageId` | ✅ |

### Shared Metadata

| Spec | Status |
|------|--------|
| `data/metadata/` (People, Dates, Events, Projects) | ⚠️ Partial, projects advancing | People-style fields in **world metadata** v1 (`localStorage`); Projects now bridge into durable platform project/task state, assignment UX, focused relevant-data blocks, and stewardship ownership. SPEC path / Tauri file TBD; **migration** — review and move existing elements into new stores at cutover (Spec Shared Metadata + `SPEC-IMPLEMENTATION-ORDER`) |

### Avatar roster, workshops, and project execution

| Area | Status | Notes |
|------|--------|-------|
| Workshops hub | ✅ | Header Workshops surface now groups Tool, Unmet Needs, Source, Projects, Creation, and Stewardship tabs; last sub-tab persists for the session |
| Avatar builder / details | ✅ Phase B shipped | Built-in and user avatars can be edited, roster priority is persisted, portraits support local image overrides plus crop / zoom, and details expose Match / Bio / Rules |
| Stewardship and capabilities | ✅ MVP | `monitor:*` duties, `tool_owner:*` groups, and individual `allowedAgenticToolIds` can be inspected and reassigned in Workshops → Stewardship |
| Project assignment / execution context | ⚠️ MVP | Assign Project writes `ownerAvatarId`, syncs long-term task rows, dedupes stale active assignments, and injects focused platform project/task state into `relevantData`; Active Task / scheduler agents remain future work |
| Complex task splitting | ❌ Next priority | Broad user goals should become a project plus executable child tasks routed by capability; tool misuse should update telemetry/task state, not only parser repair |
| Search-assisted avatar creation | ⚠️ Needs quality pass | Existing section searches are broad; improve disambiguation, source-specific queries, missing-field retries, evidence, and confidence for builder form completion |

### Behavioral Instructions for AI (Spec `SPEC-AI-INSTRUCTIONS`)

| Instruction | Status |
|-------------|--------|
| Spec-first, response style | ✅ |
| Tests | ⚠️ Vitest for email + pending helpers |
| Layout: consult user | ✅ | Shipped UI collectively approved; **new** major layout/surfaces consult user; see **docs/STYLEGUIDE.md** § 7 |
| Signature phrase | ✅ | Script + Agent-mode habit in active use (Spec `SPEC-AI-INSTRUCTIONS`) |

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
2. **Complex task execution** — Project/task state and stewardship assignment exist, but broad requests are not yet decomposed into child tasks with owners, blockers, approval, and completion evidence.
3. **Shared metadata** — World metadata v1 in `localStorage` ([`worldMetadata/`](src/services/worldMetadata/)); SPEC `data/metadata/` path and Tauri file backend still open; plan to **review and migrate** into on-disk stores when implemented (Spec Shared Metadata + `SPEC-IMPLEMENTATION-ORDER`).
4. **Proactive distribution** — MVP live (pending queue + UI); timer/cue and high-urgency UX still open; **sequential batch** polish **deprioritized** per Spec roadmap and `SPEC-PROACTIVE-NOTIFY`.
5. **Credentials path** — Spec `data/connections/...` vs app data `%APPDATA%\com.avatars.app\...` (normal for desktop).
6. **Chat Visualizer information density** — **Waves** tooltips and narrow column omit args and full denied-tool detail; **Model reply / tools parse**, **WV log**, and **session log** stay the deep drill-down until the column is enriched (see **Operability** in TL;DR above and [docs/TEST_PLAN.md](docs/TEST_PLAN.md) rows A11–A12).

---

## Deferred — Clear chat vs archive, logs, compression

| Item | Status | Notes |
|------|--------|-------|
| Archive segment / dismiss topic | ❌ | Spec `SPEC-CONVO-ARCHIVE` |
| Adjustable session-log cap | ❌ | Hard-coded 100; TECHSPEC § 12.7 |
| Semantic compression | ❌ | Turn archive / logs |
| Richer “essence” in records | ⚠️ Partial | Previews + trace |

---

## Reported issues (open)

These are **user-visible regressions or broken combinations** someone observed in the live app. They are **not** the same as [Deferred](#deferred--clear-chat-vs-archive-logs-compression) (intentionally postponed roadmap). Log new items here; add a matching manual row in [docs/TEST_PLAN.md](docs/TEST_PLAN.md) when the repro is repeatable. Close an entry by moving it to **Recent milestone bullets** with a fix note, or by an explicit **Won’t fix / deferred** decision with a pointer to SPEC/Deferred.

| ID | Area | Summary | Evidence to capture |
|----|------|---------|---------------------|
| R1 | Avatar creation from chat | Ask an avatar with **avatar creation** capability to create a new avatar (vague or partial fields). **Expected:** the model may refine partial tool args over turns **and** the user gets an **in-chat control** to open the avatar creation workflow (Creation / builder), not only prose. **Observed (reported):** several clarification turns, then a chat reply with **garbled or prose-like tool text** instead of opening creation UI. May be an untested combination of partial-fill + CTA. | **Model reply / tools parse** (parsed vs none), **WV log**, **Waves** row if any; whether output matched `avatars_tools_v1`. Manual: [docs/TEST_PLAN.md](docs/TEST_PLAN.md) **A14**. |

---

## Recent milestone bullets

- **Avatar / project operations (2026-04-26):** Phase B / early Phase C moved forward: editable avatar portraits and operational-role summaries, Workshops → Stewardship, project assignment write-through to platform ownership, focused project blocks in `relevantData`, richer platform task lifecycle fields, and removal of the obsolete header To Do control.
- **Priority realignment (2026-04-26):** Next work shifts toward avatars handling complex tasks: deterministic monitor cards, typed project/task decomposition, capability-aware routing, task state for tool failures, and a quality pass on search-assisted avatar creation for named characters.
- **Docs (2026-04-21):** Brought [AGENTIC_TOOLS.md](docs/AGENTIC_TOOLS.md), [SWITCHBOARD_VISUALIZATION.md](docs/SWITCHBOARD_VISUALIZATION.md), [HANDOFF_TOMORROW.md](HANDOFF_TOMORROW.md), [WORLD_MODEL_AND_PREPROCESSOR.md](docs/WORLD_MODEL_AND_PREPROCESSOR.md), and [TECHSPEC.md](TECHSPEC.md) § tree in line with **monitors**, **`contract:` logging**, **`drafts.*`** tool ids, and Storage viz **Background** contracts. **(Update 2026-04-21+)** Durable platform ids and Tauri I/O: [docs/PLATFORM_PERSISTENCE.md](docs/PLATFORM_PERSISTENCE.md) (`platform_cache_*`, `%LOCALAPPDATA%/.../data/platform/`, `platform_*` session-log prefix).

See **[HANDOFF_TOMORROW.md](HANDOFF_TOMORROW.md)** for checklist, **next priorities** (complex task handling / project execution, search-assisted avatar creation, and world model hardening; [`docs/WORLD_MODEL_AND_PREPROCESSOR.md`](docs/WORLD_MODEL_AND_PREPROCESSOR.md)), and the **operability** sub-priorities (user chrome, clear/end topic, Waves debug, audio+visual).
