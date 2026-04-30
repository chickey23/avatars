# Avatar Interface System — Specification

## Document Roles

- **SPEC.md** (this file): Work product — canonical project specification. Version-controlled in repo.
- **docs/STYLEGUIDE.md**: Terminology and writing — when to say **Agent** vs **Avatar** vs tools; parallel development notes; **UI approval** (layout). Does not override this spec; aligns UI and docs with it.
- **docs/CODEBASE_GUIDELINES.md**: Repo conventions — platform layer, Tauri allowlist, `AppProvider` vs view context, import style, front-end file layout (`src/app/` shell), tests. Non-normative; does not override this spec.
- **docs/DEVELOPMENT_CYCLE.md**: Human and dev **iteration loop** (plan through reflection), how verification relates to the test plan, and pointers to project `.cursor` skills/rules. Non-normative; does not override this spec.
- **.cursor/plans/**: Planning artifact — AI operational planning, phases, todos. Separate from spec.

---

## Behavioral Instructions for AI

1. **Spec-first design**: Implement per spec. When a deviation is needed, propose spec changes for user approval before implementing.
2. **Response style**: Keep explanations succinct. Identify pitfalls and alternatives.
3. **Tests**: Write and run unit tests. Request user test feedback when user input is better suited than unit tests (e.g. UX, subjective quality, real-world flows).
4. **Layout and visual choices**: Consult the user on **new** layout and visual work (major structural changes, new surfaces, or departures from existing patterns). **Shipped UI** to date is treated as approved as a whole; small iterations that stay consistent with those patterns do not require a separate sign-off each time. Detail: **docs/STYLEGUIDE.md** § UI approval.
5. **Framework explanations**: Explain test frameworks and tooling briefly as introduced.
6. **Signature phrase**: At end of each Agent-mode response, include the phrase returned by `scripts/signature.ps1` (or equivalent). Phrase and styling are configurable via `scripts/signature-config.json`. This workflow is **in active use**; agents should follow it unless the user says otherwise.
7. **Success-condition framing**: For avatar behavior, task planning, tool execution, and user-facing copy, prefer qualification gates and success conditions over negative command lists. Capabilities, evidence, ownership, and approval state should define when a step may proceed. See **docs/STYLEGUIDE.md** § Avatar operating grammar.

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

### Context scoring agents

**North star (architecture):** Per–context-family agents that read **connector-backed context** (emails, calendar events, contacts, and later news, weather, social, etc.), **extract structured fields** suitable for assessment (e.g. for email: sender, subject, snippet or body; for calendar: title, time range, location; for contacts: name, identifiers), **score or rank items** against Situation Context (Focus, active task, tags/affinities, conversation thread as applicable), and **feed outputs into the Switchboard** so relevance is not only implied by flat string blobs in prompts. One logical agent (or small family) **per context family**, implemented incrementally. Dedicated **background** runners (continuous ingestion and ranking outside user turns) are **incremental**; they are part of this vision, not a contradiction of the MVP below.

**MVP (essential):** The product still requires **ranked relevance** early. The **current implementation** delivers that via **user-turn** scoring (and related paths such as proactive evaluation) wired into the Switchboard’s ingest — see `TECHSPEC.md` § 12.3 and `docs/CONTEXT_SCORING.md`. That slice is **required for MVP** and realizes the spec’s demand for **scored / ranked signal** from structured fields, not only raw concatenation.

**Evolving mechanisms:** Concrete **scoring rules, where they run** (in-turn vs background), and **preprocessor / world-model** narrowing are **expected to change** as shared metadata, connectors, and preprocessors land. **Ranked relevance as a capability is not temporary**; only the **current mechanisms** are provisional.

**Scope:** Outputs merge into paths the Switchboard already ingests (e.g. enriched `relevantData`, structured side-channels, or `recentEvents`) — exact shape is an implementation detail.

**Implementation order (required):**

1. **Email** — First (aligns with Data Sources priority: Gmail email first).
2. **Calendar** — Second.
3. **Contacts** — Third.
4. **Additional sources** — As each connector exists (news, weather, etc.), add or extend scoring in the same pattern.

**Dependency:** Scoring runs **after** usable connector data exists for that type; it complements **Active Task** and **Focus Watcher** (which interpret task and focus) rather than replace them.

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
| Wikimedia Commons / public repositories | Reference | Prefer for avatar portrait sourcing when licensing is clear (deferred) |
| Freesound / public audio repositories | Reference | Prefer for avatar sample sourcing when licensing is clear (deferred) |
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
- **Licensing for sourced media** — For external avatar portraits, reference images, and audio samples, preserve source attribution and respect license terms. Public-domain / permissive assets are preferred where possible.

---

## Shared Metadata

- **Format**: JSON
- **Files**: By type, partition pattern — e.g. `People_Local.json`, `Events_past.json`, `Events_upcoming.json`
- **Path**: Fixed — `data/metadata/`
- **Types**: People, Dates, Events, Projects; add helpers as needed
- **Migration:** When on-disk metadata and Tauri-backed stores land, **review and migrate** existing data (e.g. world metadata v1 in `localStorage`, related keys) into the new layout. Exact cutover, dual-write, or one-time import is an implementation decision at that time.

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
5. **Stewarded avatar portrait sourcing pipeline** — Deferred process to suggest images for avatars missing portraits. Expectations: (a) run as a **stewarded** flow (monitor/task based), (b) infer preferred visual style from existing avatar portraits, (c) prefer **local** generative art sources when available even if slower (minutes per image; small outputs), (d) allow online sources with license checks, and (e) prioritize wiki/public-reference imagery (Wikipedia-family wikis, Wikimedia Commons, and similar public repositories) when suitable.
6. **Stewarded avatar audio-sample sourcing pipeline** — Deferred process to suggest or generate samples for avatars missing voice/cue snippets. Expectations: (a) run as a **stewarded** flow (monitor/task based), (b) infer preferred style from existing avatar audio/voice profile patterns, (c) prefer **local** generative audio sources when available even if slower (minutes per sample; short outputs), (d) allow online sources with license checks, and (e) prioritize wiki/public-reference or public repositories when suitable.
7. **Stewarded avatar prompt-refinement pipeline** — Deferred process to iteratively refine base avatar prompts. Expectations: (a) run as a **stewarded** flow (monitor/task based), (b) compare prompt revisions against explicit success conditions and guardrails, (c) require review checkpoints before durable prompt updates, and (d) track rationale and outcomes as task evidence.
8. **Stewarded personality/history prompt compression pipeline** — Deferred process to improve personality/history prompts by adding sourced detail while reducing memory footprint. Expectations: (a) run as a **stewarded** flow (monitor/task based), (b) pull source-backed detail with attribution where feasible, (c) condense long prompt/context memory usage without losing key identity constraints, and (d) surface confidence and unresolved gaps for user review.
9. **Stewarded project/task/interest refinement and comparison pipeline** — Deferred process where avatars are tasked to refine and compare their assigned projects, tasks, and interests. Expectations: (a) run as a **stewarded** flow (monitor/task based), (b) produce explicit compare outputs (overlap, conflicts, priority shifts, missing ownership), (c) align recommendations to capabilities/stewardship gates before execution, and (d) preserve decision history as project/task evidence.
10. **Stewarded Waves error-reporting and repair pipeline** — Deferred process for a dedicated steward role that reads tool-call errors surfaced in **Chat Visualizer (Waves)** into chat/workflow context and routes them into a workshop repair loop. Expectations: (a) run as a **stewarded** flow (monitor/task based), (b) carry error details from Waves/WV parse (tool id, error code, safe arg preview) into a repair task, (c) hand off to workshop repair for the bad call that produced the error, and (d) capture repair outcome and retry evidence in task history.

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
3. **Switchboard Chat Visualizer (Waves)** — Optional column beside chat: persistent routing queue (`SwitchboardTraceStep`–driven rows), user-turn bars, avatar-accent dots per responder, tunable rise motion, per-wave pending blink until that wave’s replies are visible; `prefers-reduced-motion` respected. Conceptual and code map: `docs/SWITCHBOARD_VISUALIZATION.md`. Major layout changes still warrant user consultation per § Behavioral Instructions.

**Next (spec-track priority):**

**Roadmap note:** **Shared metadata / projects** (world model) is prioritized ahead of further proactive polish. **Switchboard visualization** is shipped (see completed list). **Sequential multi-avatar release** for pending notifications is **lower priority** — current MVP behavior is acceptable until metadata foundations advance.

1. **Shared metadata / world model** — Implement `data/metadata/` for People, Events, **Projects** (enables contact affinity, structured project lists, user importance signals, preprocessor-friendly narrowing — see `docs/WORLD_MODEL_AND_PREPROCESSOR.md`); path toward **project execution** (`Avatar.assignedTasks`, situation context, and future Active Task / Project agents). World metadata v1 in `localStorage` is a partial step; on-disk / Tauri persistence TBD (see § Shared Metadata **Migration**).
2. **Complex task handling / project execution** — Split broad user goals into a **Project** plus executable **Tasks**. Example: “create three named avatars” is one project with three avatar-creation tasks, each routed by capability/stewardship, tracked for blockers/approval/completion evidence, and surfaced through Active Task / future Project agents. Tool misuse should feed telemetry and task state; repeated misuse is not only a parser problem.
3. **Avatar creation research quality** — Improve search-result-driven form completion for named avatars. Reference/social sources in § Data Sources remain read-only supplemental inputs for persona construction; near-term work should improve field-specific search terms, disambiguation, missing-field follow-up, source evidence, and confidence.
4. **Conversation archive (follow-on)** — **Archive segment / dismiss topic** and richer project-linked “chapters” — deferred in § Conversation archive; becomes more important alongside metadata and project/task surfaces.
5. **Background agents in action** — **(a)** **Context scoring** — MVP user-turn (and proactive) scoring for Gmail email, calendar, and contacts is in place; extend as **additional connectors** land; dedicated **background** scoring runners remain part of the north star (see § Context scoring agents). **(b)** **Active Task Agent** and **Focus Watcher Agent**; all must **feed into Switchboard** (and situation context) as specified.
6. **Proactive pending notifications (ongoing)** — Timer/cue integration; high-urgency surface per user consult. **Sequential multi-avatar release batch** — polish when prioritized; MVP in § Implemented UI is sufficient for now.
7. **Additional connectors** — Hotmail, Weather (real API), Groundnews, reference/social sources in § Data Sources (Gmail email, calendar, contacts done.)
8. **Tests** — Unit tests for Switchboard, connectors, Situation Context, proactive notification helpers, project execution, and creation research.
9. **Signature phrase** — Continue following § Behavioral Instructions; script and config under `scripts/`.
10. (Deferred items as above)

**Phased detail (non-normative):** See `docs/IMPLEMENTATION_ROADMAP.md` for the full sequence—including **bench responders** (cheap non-primary matches; see `routingDirectAddress`) and **usage-based primary ordering**—without duplicating normative requirements here.

---

## Implemented UI (Current)

- **Context panel**: Email, Calendar, Contacts, **WoS** (Well of Souls) tabs; Connect/Reconnect Gmail.
- **Focus**: User can select email, calendar event, or contact as focus; display shows titles; Clear button.
- **Environment**: Tauri indicator; **Ollama** tri-state badge (refresh on click); **Log** opens session diagnostics (connectivity / Ollama / chat pipeline notes).
- **Chat**: **Clear chat** (no confirm; clears visible thread, recent events, and queued pending turns)—**layout/readability reset**, not topic dismissal; see § Conversation archive. **View** selector (Chat / Chat + routing / Routing + log); inline trace and optional expanded log under user messages; compact turn archive in `localStorage` (see § Conversation archive and Switchboard trace). **User messages** appear immediately; **avatar replies** append incrementally as each response completes. **Pending reply** indicator when one or more turns are still processing; **input and Send stay enabled** so the user can send additional messages while replies are in flight (turns are queued). Optional **Well of Souls** output merged into `relevantData` when “Use in chat context” is on.
- **Chat Visualizer (Waves):** Optional toolbar toggle shows a **persistent waves column** next to chat: user-turn entries and one row per `SwitchboardTraceStep` with avatar-colored responder dots (accent from catalog), optional user-chrome styling, resizable width, rise-into-slot motion (tunable `SWITCHBOARD_WAVE_TRAVEL_MS`), and per-wave **pending blink** until that wave’s avatar replies are visible—see `docs/SWITCHBOARD_VISUALIZATION.md`. **`prefers-reduced-motion`** short-circuits long motion and blink. **Sounds** for waves are not implemented; remain optional and secondary if added later.
- **Workshops:** Header **Workshops** control opens Tool, Unmet Needs, Source, Projects, Creation, and Stewardship tabs. Creation supports Well of Souls and internet-assisted avatar creation; Stewardship manages monitor duties and tool capabilities without raw tag editing.
- **Progress & spec review**: See `PROGRESS.md` for status, conflicts, and next steps.
- **Technical specification**: See `TECHSPEC.md` for components and implementation details to rebuild the project.
- **Proactive notifications (MVP)**: New mail evaluated into `pendingNotifications` (interval + each user turn). **Primary Avatars** sidebar: per-avatar **truncated topic line** (replaces trait row when pending); **numeric badge** opens full pending list for that avatar with **Discuss** / **Dismiss** per row; **magnifier (🔍)** toggles description + personality traits (hidden by default). **Full prompt** includes pending block per avatar when using Ollama. **Sequential multi-avatar release** batch: further UI polish is **lower priority**; current behavior is acceptable (see § Implementation Order roadmap note).