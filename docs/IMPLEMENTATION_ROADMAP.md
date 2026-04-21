# Implementation roadmap (phased)

**Non-normative companion to [SPEC.md](../SPEC.md).** Canonical requirements remain in SPEC; this file sequences work and records design intent.

**Related:** [SWITCHBOARD_VISUALIZATION.md](SWITCHBOARD_VISUALIZATION.md), [PROGRESS.md](../PROGRESS.md), [HANDOFF_TOMORROW.md](../HANDOFF_TOMORROW.md).

---

## Phase A — Switchboard visualization (**shipped**)

1. **Design checkpoint (blocking):** Placement, density, off-by-default vs toggle, `prefers-reduced-motion`; sound optional/secondary.
2. **MVP:** Replay-from-`SwitchboardTraceStep` after `distributeAndRespond`; live sync via **`onWaveChatComplete`** (per cascade depth) plus `markWaveSettledForUserDepth`.
3. **UI:** Component beside chat (`SwitchboardViz`); default Chat remains readable when the column is off.
4. **Docs:** SPEC § Implemented UI / PROGRESS / this file updated.

**Immediate next focus:** Phases **B–C** (avatar builder usage, **`assignedTasks`**, shared metadata / **Projects**). See [`WORLD_MODEL_AND_PREPROCESSOR.md`](WORLD_MODEL_AND_PREPROCESSOR.md).

---

## Phase B — Builder, avatars, and project assignment (prep)

1. Grow catalog via avatar builder (`userAvatars`, `builtinAvatarEdits` on situation context).
2. Use **`assignedTasks`** until shared **Projects** exist (Phase C).

---

## Phase C — Shared metadata (`data/metadata/`)

1. Projects (and People/Events as needed); evolve world metadata or add on-disk/Tauri JSON per SPEC.
2. UI / chat entry for projects and optional “current project” in situation context.
3. Contact affinity wiring for scoring.

---

## Phase D — Project execution

1. Bridge `assignedTasks`, Project records, and `activeTask` for prompts and routing.
2. Later: Active Task / Focus Watcher agents per SPEC.

---

## Phase E — Lightweight “bench” responders (non-primary)

**Goal:** Avatars **not** in the current primary strip can still reply when the user message is a **very specific** match—keep this path **cheap** (latency + tokens).

- **Roster model:** Maintain **`allAvatars`** (full roster) vs **`primaryAvatars`** (slice after rank / slot count).
- **Second-stage (or parallel cheap) scorer:** Run only when:
  - primary routing returns **default / low confidence**, and/or
  - **[`routingDirectAddress`](../src/services/routingDirectAddress.ts)** hits a **bench** id (direct address to someone outside the strip).
- **Limits:** At most **one bench avatar per turn**, or require score above a **high** threshold; **skip heavy context fetch** for bench (e.g. lean `relevantData` or reuse primary turn’s snapshot).
- **Ollama cost:** Avoid doubling calls—options include a **single** prompt with “if no primary match, only consider…”, or a **fast keyword / rules gate** before any bench model invocation.

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

Reddit, Wikipedia, Wookieepedia, Memory Alpha, etc. — read-only **supplemental** sources for avatar/persona construction; deferred until convenient. See SPEC § Data Sources.

---

## Documentation realignment (done)

SPEC / PROGRESS / HANDOFF prioritize **world model / metadata** after shipped visualization; proactive **sequential batch** polish is lower priority.

---

## Risks / constraints

- Visualization: accessibility (`prefers-reduced-motion`), SPEC layout consult.
- Bench path: must not balloon latency or token use; cap bench participation.
- Popularity: avoid surprising reordering—clear UI copy and optional pins.
