# Implementation roadmap (phased)

**Non-normative companion to [SPEC.md](../SPEC.md).** Canonical requirements remain in SPEC; this file sequences work and records design intent.

**Stable SPEC IDs for cross-reference:** `SPEC-IMPLEMENTATION-ORDER`, `SPEC-CONTEXT-SCORING`, `SPEC-PROACTIVE-NOTIFY`, `SPEC-CONVO-ARCHIVE`, `SPEC-VALIDATION-MAP`, `SPEC-AI-INSTRUCTIONS`.

**Related:** [VISION_AND_USE_CASES.md](VISION_AND_USE_CASES.md) (product intent and proposal alignment), [SWITCHBOARD_VISUALIZATION.md](SWITCHBOARD_VISUALIZATION.md), [PROGRESS.md](../PROGRESS.md), [HANDOFF_TOMORROW.md](../HANDOFF_TOMORROW.md).

---

## Phase A — Switchboard visualization (**shipped**)

1. **Design checkpoint (blocking):** Placement, density, off-by-default vs toggle, `prefers-reduced-motion`; sound optional/secondary.
2. **MVP:** Replay-from-`SwitchboardTraceStep` after `distributeAndRespond`; live sync via **`onWaveChatComplete`** (per cascade depth) plus `markWaveSettledForUserDepth`.
3. **UI:** Component beside chat (`SwitchboardViz`); default Chat remains readable when the column is off.
4. **Docs:** SPEC Implemented UI (Current), `SPEC-IMPLEMENTATION-ORDER`, PROGRESS, and this file updated.

**Immediate next focus:** Phase **D** — complex task handling over project/task state — plus a focused Phase **B2** quality pass on search-assisted avatar creation. See [`WORLD_MODEL_AND_PREPROCESSOR.md`](WORLD_MODEL_AND_PREPROCESSOR.md).

---

## Phase B — Builder, avatars, and project assignment (prep)

1. Grow catalog via avatar builder (`userAvatars`, `builtinAvatarEdits` on situation context).
2. Use **`assignedTasks`** until shared **Projects** exist (Phase C).

---

## Phase B2 — Avatar creation research quality

**Goal:** Make internet-assisted avatar creation reliably fill builder fields from search results, especially for named historical / fictional / public-reference avatars.

1. Improve query generation: include entity disambiguation, source-family hints (official / wiki / encyclopedia / fandom source as appropriate), aliases, and field-specific terms. Current section queries are broad and can miss field evidence.
2. Improve result extraction: prefer fetched page snippets or structured source summaries over only top-level search result lines; preserve citations per field.
3. Add confidence and missing-field reporting: every builder field should show whether it was filled from evidence, guessed from weak evidence, or left for the user.
4. Iterate searches when a field is empty: run narrower follow-up queries for missing fields instead of accepting sparse first-pass results.
5. Keep connector boundaries read-only. Reference sources (Wikipedia, Wookieepedia, Memory Alpha, etc.) remain supplemental inputs for avatar/persona construction, not core chat dependencies.
6. **Deferred follow-on (stewarded):** add a portrait-suggestion pipeline for avatars missing images. Infer style from existing avatars, prefer local generative sources (slow is acceptable for small images), allow online sources with explicit licensing checks, and prioritize wiki/public repositories when they fit.
7. **Deferred follow-on (stewarded audio):** add an audio-sample suggestion/generation pipeline for avatars missing voice/cue assets. Infer style from existing avatars' audio patterns, prefer local generative sources (slow is acceptable for short samples), allow online sources with explicit licensing checks, and prioritize wiki/public repositories when they fit.
8. **Deferred follow-on (stewarded prompt refinement):** add a monitor/task pipeline to iteratively refine avatar base prompts against explicit success conditions and guardrails, with review checkpoints before durable updates.
9. **Deferred follow-on (stewarded personality/history condensation):** add a pipeline that injects source-backed personality/history detail while condensing prompt memory footprint; include attribution where feasible plus confidence/missing-gap reporting.

---

## Phase C — Shared metadata (`data/metadata/`)

1. Projects (and People/Events as needed); evolve world metadata or add on-disk/Tauri JSON per SPEC Shared Metadata and `SPEC-IMPLEMENTATION-ORDER`.
2. UI / chat entry for projects and optional “current project” in situation context.
3. Contact affinity wiring for scoring.

---

## Phase D — Project execution

**Goal:** Let avatars handle complex user requests by splitting them into executable tasks, routing each task to the right capability owner, and surfacing progress without forcing a single avatar/tool call to do everything at once.

Use the operating grammar in [STYLEGUIDE.md](STYLEGUIDE.md): descriptors, instructions, capabilities, stewardships, plan steps, and tool calls are separate. Instructions should describe success conditions; capabilities and approvals should gate execution. Avoid making negative commands the main control surface when eligibility checks can define the valid path.

**Complex Task Monitor pattern:** The preferred first layer is deterministic orchestration, not a mandatory Ollama prepass. Complex requests should produce a user-reviewable monitor card, modeled on `monitor:unassigned_projects`, that can show the discovered plan, candidate items, missing requirements, and next actions before tasks or model/tool calls are created.

**Chat-driven set discovery (implicit):** Cast- or roster-style user lines (e.g. “Who was in …?”, “main cast of …”, “states of …”, “parts of …”, “list of …” with tooling negatives) that do not match `parseAvatarCreationPlan` still surface the same `complex_task_planner` **Search members** flow and persist to `knowledgeSets` via the existing discovery stack (`parseImplicitSetDiscoveryPlan`). After Wikidata misses a confident roster, the desktop path tries **Ollama** once before legacy web search when Ollama is ready. Stewardship copy on synthetic discovery cards is scoped to explicit set / avatar-creation flows (not implicit-only roster trivia). Synthetic cards may attribute to `primaryAvatarId` when the send path supplies it. Per-avatar internet gating for Wikidata vs legacy web remains a follow-up.

**World metadata v4:** Optional `curatedAssertions` (seeded idempotently at startup) and optional `setCompositionTags` on `knowledgeSets` for forward-compatible tagging. `user_profile.patch` without explicit user save language materializes as a pending on-disk proposal plus **Apply** / **Discard** synthetic chat actions before mutating `userProfile`.

1. Treat the **Project** as the narrative container: user goal, rationale, constraints, source links, and progress history.
2. Treat **Tasks** as the execution grain: one clear action, owner avatar or required capability, status/workflow state, blocker/approval fields, and completion evidence.
3. Add a typed task-splitting step for complex requests. Example: “create three named avatars” becomes one project plus three avatar-creation tasks, each with its own research/form-fill/approval path. “Create avatars for the main crew of Firefly” first discovers and reviews the crew list, then repeats avatar creation for accepted members.
4. Surface review-card actions such as **Create tasks**, **Edit list**, **Search members**, **Ask avatars to suggest plan**, and **Skip** before mutating durable task state.
5. Route tasks by capability and stewardship (`tool_owner:*`, `allowedAgenticToolIds`, `monitor:*`) before model prompting so the wrong avatar is not asked to use the wrong tool.
6. Use tool telemetry and parse diagnostics as feedback, but do not treat repeated tool misuse as only a parser problem. Escalate it into task decomposition, missing capability, or waiting-for-user state.
7. Bridge `assignedTasks`, platform Project/Task records, and `activeTask` for prompts and routing.
8. Later: Active Task / Focus Watcher agents per SPEC architecture and `SPEC-IMPLEMENTATION-ORDER`.
9. **Deferred follow-on (stewarded comparison/refinement):** task avatars to refine and compare their assigned projects, tasks, and interests; generate overlap/conflict/priority recommendations, then gate execution through capability and stewardship checks.

---

## Phase D1 — Targeted tool-error self-repair (missing requirements first)

**Goal:** Reduce predictable tool-call failures by adding a focused post-validation repair lane for missing required arguments. Frame failures as **missing requirements to satisfy** whenever possible.

1. Add a **single-attempt targeted repair** path for deterministic missing-arg failures after normal execution validation.
2. Keep strict guardrails: same tool id only, no capability escalation, no permission bypass, no cross-tool substitution, and no retries beyond configured cap.
3. Feed the focused repair call with: user message context, tool id, non-secret args preview, structured error code, and required-field list.
4. Prefer trusted context values only; if required values are unavailable, stop retrying and surface unmet requirements as task/monitor state.
5. Persist attempt lineage (`initial`, `repair_missing_args`, `final_status`) and per-tool repair outcomes for telemetry and workshop review.
6. Keep parser repair behavior intact; this is an additional lane for schema-valid but incomplete calls.
7. Seed deterministic missing-arg patterns from execution validators (`drafts.tasks`, `drafts.calendar_event`, `drafts.email_reply`, `avatars.workshop.open_draft`) and expand only from observed telemetry.
8. **Deferred follow-on (stewarded Waves error role):** add a steward that reads Waves/tool-parse errors into chat/workflow context, opens a workshop repair task for the failing call, and tracks repair/retry outcomes as durable evidence.
9. **Deferred follow-on (stewarded user-health role):** add a bedtime/tiredness steward that starts from system-time heuristics, introduces a tiredness slider beside the engagement slider, and feeds low-friction rest-aware suggestions into chat/workflow context.

**Acceptance criteria**

- Recurrence of known missing-arg errors drops for targeted tools.
- No increase in permission/capability bypass incidents.
- Waves/workshop surfaces unmet requirements clearly when repair cannot proceed.
- Tests cover: successful repair, no-context fallback to requirement state, and retry-cap stop.

---

## Phase E — Lightweight “bench” responders (non-primary)

**Goal:** Avatars **not** in the current primary strip can still reply when the user message is a **very specific** match—keep this path **cheap** (latency + tokens).

- **Roster model:** Maintain **`allAvatars`** (full roster) vs **`primaryAvatars`** (slice after rank / slot count).
- **Second-stage (or parallel cheap) scorer:** Run only when:
  - primary routing returns **default / low confidence**, and/or
  - **[`routingDirectAddress`](../src/services/routingDirectAddress.ts)** hits a **bench** id (direct address to someone outside the strip).
- **Limits:** At most **one bench avatar per turn**, or require score above a **high** threshold; **skip heavy context fetch** for bench (e.g. lean `relevantData` or reuse primary turn’s snapshot).
- **Ollama cost:** Avoid doubling calls—options include a **single** prompt with “if no primary match, only consider…”, or a **fast keyword / rules gate** before any bench model invocation.
- **Local LLM baseline:** Periodically revisit **small vs larger** local models for avatar reply quality and tool reliability; documented baseline and trade-offs live in [TECHSPEC.md](../TECHSPEC.md) §8 (Ollama Integration).

---

## Phase F — Usage, popularity, and dynamic primary ordering

**Goal:** Track **usage and popularity** over time so frequently used avatars **rise** in the roster and unused ones **sink** (can fall off the primary strip but stay in picker/bench).

- **Persist** per-avatar metrics: e.g. `replyCount`, `lastUsedAt`, optional **exponential decay** popularity score (local-only unless you add sync later).
- **Sort** full roster or primary candidates by popularity, tie-break by **recency** or **manual pin** (future).
- **Promotion/demotion:** Primary strip shows **top N** by score where **N = `primaryAvatarSlotCount`**; UI should **explain** ordering (e.g. “Ordered by usage”; “Pin to top” optional later).
- **Privacy:** metrics stay **local-only** until explicit sync is designed.

---

## Phase G — Conversation archive (follow-on to metadata / todos)

1. **Archive segment / dismiss topic** (distinct from Clear chat); tie segments to **project id** and optional todo snapshots where useful.
2. Optional: enrich `CompactTurnRecord` “essence” for project audit (not full verbatim unless a separate feature).

---

## Connectors backlog (supplemental)

Reddit, Wikipedia, Wookieepedia, Memory Alpha, etc. — read-only **supplemental** sources for avatar/persona construction; deferred until convenient. See SPEC Data Sources and `SPEC-IMPLEMENTATION-ORDER`.

---

## Documentation realignment (done)

SPEC / PROGRESS / HANDOFF now prioritize **complex task handling / project execution** on top of the world model, with **search-assisted avatar creation quality** as a parallel near-term track; proactive **sequential batch** polish is lower priority.

---

## Risks / constraints

- Visualization: accessibility (`prefers-reduced-motion`), SPEC layout consult per `SPEC-AI-INSTRUCTIONS`.
- Bench path: must not balloon latency or token use; cap bench participation.
- Popularity: avoid surprising reordering—clear UI copy and optional pins.
- GUI language: current labels such as **No JSON tools**, **Permission denied**, **Unhelpful reply**, **Dismiss**, and **Skip** should be revisited opportunistically so the product emphasizes missing success conditions, gates, and next actions rather than negative commands.
