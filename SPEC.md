# Avatar Interface System — Specification

## Document Roles

- **SPEC.md** (this file): Work product — canonical project specification. Version-controlled in repo.
- **docs/STYLEGUIDE.md**: Terminology and writing — when to say **Agent** vs **Avatar** vs tools; parallel development notes. Does not override this spec; aligns UI and docs with it.
- **.cursor/plans/**: Planning artifact — AI operational planning, phases, todos. Separate from spec.

---

## Behavioral Instructions for AI

1. **Spec-first design**: Implement per spec. When a deviation is needed, propose spec changes for user approval before implementing.
2. **Response style**: Keep explanations succinct. Identify pitfalls and alternatives.
3. **Tests**: Write and run unit tests. Request user test feedback when user input is better suited than unit tests (e.g. UX, subjective quality, real-world flows).
4. **Layout and visual choices**: Consult user on all layout and visual choices.
5. **Framework explanations**: Explain test frameworks and tooling briefly as introduced.
6. **Signature phrase**: At end of each Agent-mode response, include the phrase returned by `scripts/signature.ps1` (or equivalent). Phrase and styling are configurable via `scripts/signature-config.json`.

---

## Architecture Overview

### Layers

- **User** — interacts with Avatars
- **Avatar Layer** — user-facing interface; recognizable characters (eventually likeness, voice, personality)
- **Switchboard Agent** — coordination; ingests data, scores relevance, distributes to Avatars
- **Agent Layer** — Avatar Interface Agents, Background Agents (**including context scoring agents** per source type), Active Task Agent, Focus Watcher Agent, Project Agents, Sleeper
- **Data Sources** — Email, Calendar, Contacts, Weather, News, etc.

### Switchboard Agent Function

1. **Data ingestion**: Pulls from connectors (Gmail, calendar, contacts, etc.), background agents, timer/cue system.
2. **Relevance scoring**: Evaluates items against Situation Context, tags, affinities.
3. **Distribution (reactive)**: On user input, selects Avatar(s) to respond; orchestrates cascade.
4. **Distribution (proactive)**: Maintains a **pending notification** queue and routes work to Avatars by affinity and timing — see **§ Proactive notifications and pending reactions**.
5. **Coordination**: Manages cascade depth/flow; ensures background outputs surface through Avatars.

**Implementation note (reactive distribution):** User messages are processed in **serialized queued turns** so the user can send again while a prior turn is still generating. Each turn uses the **latest** conversation thread for prompts (including subsequent user lines) while **routing** and the primary “User just said” line target the **anchored** user message for that turn (`replyToUserMessageId`, ephemeral — not persisted). **Cascade** (avatar responding after another avatar) uses the **actual thread tail** when the last message is an avatar, so routing does not incorrectly stay on an older user anchor. See `TECHSPEC.md` data flow and `docs/STYLEGUIDE.md` for **Switchboard** terminology.

### Conversation archive and Switchboard trace

- **Purpose**: Append-only **compact turn records** for downstream processing (analytics, training, debugging, **reference and reprocessing**). Goal is **essence** (routing, previews, provenance where recorded)—**not** a complete verbatim transcript unless a separate feature adds that. Records may be **insufficient** for some workflows until extended (deferred implementation).
- **Per turn** (one user send and its cascade): one record linked to the **user message id** (`userMessageId`), with truncated user text preview, optional focus ids, primary avatar id at send time, ordered **Switchboard trace** (per wave: responder ids + selection reason: forced primary, tag/interest match, default primary, or cascade), and optional short reply previews per avatar.
- **Storage**: Browser `localStorage` key `avatars_turn_archive` (capped list, separate from `avatars_situation_context`). Not in git.
- **Clear chat** (implemented): Clears the **visible conversation thread**, trims **recent events**, and clears **queued pending turns**. Primary intent is a **readable / layout reset** (e.g. when the thread has grown enough to strain scroll or window space) and dropping ephemeral thread-bound UI state. It is **not** the canonical signal that a **chat topic is dismissed** or that agents should treat prior work as a closed “chapter.” The **turn archive** is **not** deleted; past turns remain for reference via **View** modes.
- **Archive segment / dismiss topic** (deferred): A **separate** control (label and UX TBD; consult user on layout copy) for the user to mark a **conversation segment or topic** as intentionally closed while **retaining** and improving **reference material** in the archive and logs for later reprocessing. Distinct from Clear chat.
- **Session logs on disk** (Tauri): Diagnostic lines under the app data path; see `TECHSPEC.md`. **Rotation / packaging:** when starting a new session log, if the number of `*.log` files in the session folder reaches **100** (current default constant), existing logs are **batched into a timestamped zip** under `archives/` and removed. This is **file-count rotation**, not summarization of log *content*. **Future:** make that threshold **user-adjustable** (app setting or config). **Semantic compression** (deferred, separate from zip): optional second phase to **summarize or merge** older turn-archive rows and/or log material for storage and retrieval—**when** it runs (aligned with the same threshold, on schedule, or manual) is **TBD**.
- **UI**: **View** control with three modes (default **Chat**): (1) **Chat** — messages only; (2) **Chat + routing** — one inconspicuous line under each **user** message with routing summary; (3) **Routing + log** — same line plus a compact multi-line block per user turn (timestamp, previews, ids, trace steps, reply lines). When the thread is empty and a routing-related mode is selected, a short note may indicate how many past turns remain archived.

### Situation Context

- **Conversation thread** — user and avatar messages (see archive § above).
- **Recent events**
- **Active task**
- **Cues and triggers**
- **`relevantData`** (optional) — connector- and focus-derived strings merged for avatar prompts; may include Well of Souls draft when enabled.
- **`pendingNotifications` (optional)** — structured, revisable list of proactive offers (see § Proactive notifications). May be persisted; entries age out or update as the thread and connector snapshots change.
- **Well of Souls (optional)** — `wellOfSoulsRules` and `useWellOfSoulsInChat` when the user generates rules in Context and opts into chat context (see § Implemented UI).
- **Ephemeral (not persisted): `replyToUserMessageId`** — during processing of a queued user turn, identifies which user message that turn answers so prompts and routing stay correct when newer user messages already appear in the thread.
- **Ephemeral (optional): `pendingReleaseClusterIds`** — topic cluster ids treated as **released** for the current user turn because the user’s message addresses those topics (see § Proactive notifications).

Naming for agents vs avatars vs tools: **docs/STYLEGUIDE.md**.

### Active Task Agent

The Active Task Agent manages what the active task is. He will be personified with an Avatar.

**Rules for Active Task:**
- If the user is doing something productive → that is the active task.
- If the user is *not* doing something productive → the active task does *not* change.
- If the app is doing something productive on the user's behalf → that is the active task.

**Capabilities:**
- **History**: Maintains a history of active tasks.
- **Stimulus tracking**: Records what stimulus caused each task change.
- **Anticipation**: Tries to anticipate when to change task.
- **Certainty**: Offers a percentage of certainty for the current/anticipated task.
- **Visual display**: Certainty reflected in color (e.g., stronger color = higher certainty).

### Focus

Focus is user-selected context (email, calendar event, or contact) that serves as input for the AIs to consider. As the user adds terms to Focus, they refine what the AIs should consider—either adding detail to an existing conversation or changing what is being worked on.

### Focus Watcher Agent

The Focus Watcher Agent interprets changes to Focus. He will be personified with an Avatar. He learns how to respond to focus changes over time; this agent is trained incrementally.

### Context scoring agents (background)

**Purpose:** Background agents that read **connector-backed context** (emails, calendar events, contacts, and later news, weather, social, etc.), **extract structured fields** suitable for assessment (e.g. for email: sender, subject, snippet or body; for calendar: title, time range, location; for contacts: name, identifiers), **score or rank items** against Situation Context (Focus, active task, tags/affinities, conversation thread as applicable), and **feed outputs into the Switchboard** so relevance is not only implied by flat string blobs in prompts.

**Scope:** One logical agent (or small family) **per context family**, implemented incrementally. Outputs merge into paths the Switchboard already ingests (e.g. enriched `relevantData`, structured side-channels, or `recentEvents`) — exact shape is an implementation detail; the spec requires **scored / ranked signal** from structured fields, not only raw concatenation.

**Implementation order (required):**

1. **Email** — First (aligns with Data Sources priority: Gmail email first).
2. **Calendar** — Second.
3. **Contacts** — Third.
4. **Additional sources** — As each connector exists (news, weather, etc.), add or extend scoring in the same pattern.

**Dependency:** Context scoring agents run **after** usable connector data exists for that type; they complement **Active Task** and **Focus Watcher** (which interpret task and focus) rather than replace them.

### Proactive notifications and pending reactions

**Purpose:** When **new or updated** connector-backed items arrive (email, calendar, contacts, etc.), the system may surface **optional** proactive interest from Avatars — e.g. a brief reaction to a notable message. **Most** ingestion passes produce **no** UI. This path is **separate** from user-turn `relevantData` scoring: it uses **per-avatar** relevance for the same underlying event.

**Non-blocking:** Ingestion and evaluation must not block the main UI; use async work, debouncing, and strict time budgets.

**Importance tiers:**

- **Low** — No default UI obligation; may age out or remain on hold; typically ignored unless the user opens a pending review surface later.
- **Medium** — **Avatar notification indicator** (e.g. badge) and optional **one-line topic hint** (source + gist).
- **High** — **Interruption** (toast, banner, or inline urgent surface). Exact layout **TBD; consult user** per § Behavioral Instructions.

**Focus and dominance:** Where Focus applies, it remains the **strongest** signal. Non-focus matches should be **unlikely** to outrank focus-sized relevance; use score caps / ordering rules so pathological competition does not occur.

**Same topic, multiple Avatars:** More than one Avatar may have something to say about the **same** topic. Delivery is **sequential**. **At most three Avatars** per released batch (current cap). Order within the batch is **score-driven**, not a fixed roster order.

**Release (unlock):** (1) **Discuss** on a pending row (sidebar): posts a short user line, forces that topic cluster to **released** in the prompt for that turn, and removes that cluster from `pendingNotifications` after the turn completes; (2) **Dismiss** removes that pending row without a turn; (3) The **user’s message counts as release** when it **addresses the topic** (token overlap). Pending items **re-evaluate** as the conversation and connector data change so the UI does not show **stale** or **redundant** offers.

**Prompt contract:** Pending notifications may be passed into **Ollama** (or template) prompts as structured context. The model should **incorporate** them when relevant to the user’s turn or **treat as separate held topics** when not a match — no forced merge of unrelated threads.

**Contact affinity:** When **relative affinity** and **supplemental knowledge** exist for contacts (see § Shared Metadata), proactive and turn scoring should use them to refine boosts and suppression; until then, **heuristics** only.

**Timer/cue integration:** Future timer/cue jobs may enqueue into the **same** pending-notification system so one pipeline handles connector deltas and time-based cues.

---

## Avatars

- **Individuals**: Each Avatar is its own entity. Sets (Calliope/Mark Antony/Diogenes as default primaries, 3 Norns, 3 Fates) are for convenience; Avatars can be mixed and matched.
- **Extensibility**: Avatars can be added individually or in sets; custom or from reference (historical, fictional).
- **Target**: Recognizable likeness, voice, personality.
- **Notification job queue**: Avatars take notification jobs from a queue based on affinity (tags, interests, personality) and timing (user context at that moment).

---

## Data Sources and Connectors

### Target Sources

| Source | Type | Notes |
|--------|------|-------|
| Gmail | Email, Calendar | Priority: Gmail email first |
| Hotmail | Email | |
| Google | Contacts | |
| Groundnews | News | User has account |
| Reddit | Social | Several accounts; prefer audit account |
| Wikipedia | Reference | Supplemental material for avatar/persona construction (deferred) |
| Wookieepedia | Reference | Star Wars wiki; supplemental for avatar creation (deferred) |
| Memory Alpha | Reference | Star Trek wiki; supplemental for avatar creation (deferred) |
| GitHub | Repos | Watching |
| Weather | Weather | No account yet; free API |
| Boing Boing | RSS | Public feed |

### Connector Rules

- **Read-only** — all connectors read-only
- **Toggleable** — connections on/off; no unused connections left active
- **Credentials**: Plain text local for now; one config file per source
- **Structure**: `data/connections/enabled/<source>/` and `data/connections/disabled/<source>/` — move folder to enable/disable
- **Desktop apps**: May use an app-specific path (e.g. `%APPDATA%\com.avatars.app\data\connections\enabled\<source>\` on Windows) instead of project-relative `data/`
- **Reference wikis / social (deferred)** — Wikipedia, Wookieepedia, Memory Alpha, Reddit (see § Target Sources): intended as **read-only supplemental** inputs during avatar creation and persona research; not required for core chat flows.

---

## Shared Metadata

- **Format**: JSON
- **Files**: By type, partition pattern — e.g. `People_Local.json`, `Events_past.json`, `Events_upcoming.json`
- **Path**: Fixed — `data/metadata/`
- **Types**: People, Dates, Events, Projects; add helpers as needed

---

## Security

- **Credentials**: Excluded from git (see .gitignore)
- **Security Agent** (deferred): Examines security vulnerabilities across connected systems; may extend to threat detection. Broad definition.

---

## Deferred Items (Ordered)

1. **Alternate avatar sets** — 3 Norns, 3 Fates; config extension
2. **Project agents** — Lesson Plan, Fitness Plan, Android Project, etc.
3. **Security Agent** — After connectors in place
4. **The Sleeper** — User-mimic agent; after stable system and conversation history

---

## Signature Executable

- **Location**: `scripts/signature.ps1` (or `.bat`)
- **Output**: JSON — e.g. `{"phrase": "je me souviens", "style": {}}`
- **Config**: `scripts/signature-config.json` — phrase and styling; script reads config

---

## Implementation Order (Active)

**Completed relative to earlier drafts** (see § Implemented UI and `PROGRESS.md` for detail):

1. **Focus in Situation Context** — Selected focus items are passed into `relevantData` for avatars.
2. **Local LLM (Ollama) UX and diagnostics** — Tri-state presence in the UI (`no_server` / `no_models` / `ready`); reply provenance (`ReplySource`: Ollama, Rules, Fallback) with short errors and prompt panels; Rules-path sub-reasons when the template engine runs without generation; session log (in-app **Log** control; optional on-disk rotation under the app data path in Tauri). Well of Souls (**WoS**) in Context with optional merge into chat context.

**Next (spec-track priority):**

**Roadmap note:** **Switchboard visualization** and **shared metadata / projects** are prioritized ahead of further proactive polish. **Sequential multi-avatar release** for pending notifications is **lower priority** — current MVP behavior is acceptable until visualization and metadata foundations advance.

1. **Switchboard visualization** — Ambient wave/trace UI (e.g. ascending avatar-colored bubbles) driven by `SwitchboardTraceStep` / cascade timing; conceptual notes in `docs/SWITCHBOARD_VISUALIZATION.md`. **Layout and motion require explicit user consultation** per § Behavioral Instructions; sounds optional and secondary.
2. **Shared metadata** — Implement `data/metadata/` for People, Events, **Projects** (enables contact affinity, structured project lists, and a path toward **project execution** — `Avatar.assignedTasks`, situation context, and future Active Task / Project agents). World metadata v1 in `localStorage` is a partial step; on-disk / Tauri persistence TBD.
3. **Conversation archive (follow-on)** — **Archive segment / dismiss topic** and richer project-linked “chapters” — deferred in § Conversation archive; becomes more important alongside metadata and todo/project surfaces.
4. **Background agents in action** — **(a)** **Context scoring** — user-turn scoring for Gmail email, calendar, and contacts is in place; extend as **additional connectors** land (see § Context scoring agents). **(b)** **Active Task Agent** and **Focus Watcher Agent**; all must **feed into Switchboard** (and situation context) as specified.
5. **Proactive pending notifications (ongoing)** — Timer/cue integration; high-urgency surface per user consult. **Sequential multi-avatar release batch** — polish when prioritized; MVP in § Implemented UI is sufficient for now.
6. **Additional connectors** — Hotmail, Weather (real API), Groundnews, reference/social sources in § Data Sources (Gmail email, calendar, contacts done.)
7. **Tests** — Unit tests for Switchboard, connectors, Situation Context, proactive notification helpers.
8. **Signature phrase** — Ensure Agent-mode responses include the phrase from `scripts/signature.ps1`.
9. (Deferred items as above)

**Phased detail (non-normative):** See `docs/IMPLEMENTATION_ROADMAP.md` for the full sequence—including **bench responders** (cheap non-primary matches; see `routingDirectAddress`) and **usage-based primary ordering**—without duplicating normative requirements here.

---

## Implemented UI (Current)

- **Context panel**: Email, Calendar, Contacts, **WoS** (Well of Souls) tabs; Connect/Reconnect Gmail.
- **Focus**: User can select email, calendar event, or contact as focus; display shows titles; Clear button.
- **Environment**: Tauri indicator; **Ollama** tri-state badge (refresh on click); **Log** opens session diagnostics (connectivity / Ollama / chat pipeline notes).
- **Chat**: **Clear chat** (no confirm; clears visible thread, recent events, and queued pending turns)—**layout/readability reset**, not topic dismissal; see § Conversation archive. **View** selector (Chat / Chat + routing / Routing + log); inline trace and optional expanded log under user messages; compact turn archive in `localStorage` (see § Conversation archive and Switchboard trace). **User messages** appear immediately; **avatar replies** append incrementally as each response completes. **Pending reply** indicator when one or more turns are still processing; **input and Send stay enabled** so the user can send additional messages while replies are in flight (turns are queued). Optional **Well of Souls** output merged into `relevantData` when “Use in chat context” is on.
- **Next UI build (consult user before building):** **Switchboard visualization** — ambient trace/wave UI (e.g. ascending avatar-colored bubbles timed to waves); conceptual notes in `docs/SWITCHBOARD_VISUALIZATION.md`; layout and motion require explicit user approval per § Behavioral Instructions. **Sounds** remain optional and secondary.
- **To Do List** (header, upper right): Quick links — Google, Screenshots folder, Downloads folder. Opens in browser or file explorer.
- **Progress & spec review**: See `PROGRESS.md` for status, conflicts, and next steps.
- **Technical specification**: See `TECHSPEC.md` for components and implementation details to rebuild the project.
- **Proactive notifications (MVP)**: New mail evaluated into `pendingNotifications` (interval + each user turn). **Primary Avatars** sidebar: per-avatar **truncated topic line** (replaces trait row when pending); **numeric badge** opens full pending list for that avatar with **Discuss** / **Dismiss** per row; **magnifier (🔍)** toggles description + personality traits (hidden by default). **Full prompt** includes pending block per avatar when using Ollama. **Sequential multi-avatar release** batch: further UI polish is **lower priority**; current behavior is acceptable (see § Implementation Order roadmap note).