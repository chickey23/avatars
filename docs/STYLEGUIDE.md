# Style guide — terminology and writing

This project overloads **agent** in several domains. Use the definitions below in **UI copy, comments, SPEC/PROGRESS, and commit messages** so humans and AI assistants stay aligned.

---

## 1. Canonical terms (use these)

| Term | Meaning | Example |
|------|---------|---------|
| **Avatar** | User-facing character (personality, chat UI). Implements `Avatar` in code. | “Ask the Calliope avatar.” |
| **Agent** (capital) | A **first-class architecture actor** in SPEC: implements or will implement `Agent`, participates in Switchboard / Situation Context, or is explicitly named in SPEC (Switchboard Agent, Active Task Agent, …). | “The Switchboard Agent routes turns.” |
| **Avatar Interface Agent** | The **per-avatar chat pipeline** that runs with full Situation Context: `runAvatarAgent` in [`avatarAgents.ts`](../src/services/avatarAgents.ts). Not every `Agent` record in data; this is the **runtime role**. | “The Avatar Interface Agent builds the Ollama prompt.” |
| **Background agent** | Code in [`backgroundAgents.ts`](../src/services/backgroundAgents.ts): registered runners, optional notification-style outputs. Lowercase when used as a **category** in prose; capitalize when naming a **specific** spec’d agent. | “Register a background agent for weather.” |
| **Context scoring agent** | SPEC-defined **role** per context family: score/rank connector items (email → calendar → contacts → …). **MVP** implements this via user-turn and proactive paths; dedicated **background** runners are incremental. | Per SPEC § Context scoring agents; **TECHSPEC** § 12.3. |
| **Switchboard** | Coordination layer (`switchboard.ts`): relevance, cascade, `distributeAndRespond`. Often paired with “Switchboard Agent” in SPEC. | “The Switchboard selects responders.” |
| **Project** | A **real-world container** the user (and Avatars) track in shared metadata: goals, notes, links to people/events; may own **many** tasks. In code, `ProjectMetadataRecord` / world metadata `projects`. | “Assign work to the Q2 launch **Project**.” |
| **Task** | An **assignable unit** of work: `LongTermTask`, **`Avatar.assignedTasks`**, or UI “to-do” toward a project. **Project** and **task** are sometimes used loosely in conversation; in docs prefer **Project** for the container and **task** for the atomic item. | “This **task** belongs to the renovation **Project**.” |
| **Connector** | Code under [`src/connectors/`](../src/connectors/) that talks to an external or mock **source** (Gmail, Calendar, etc.). | “The Gmail **connector** fetches message bodies via Tauri.” |
| **Source** | Abstract data channel in caching and context scoring (email, calendar, contacts). | “**Source** cache holds ranked email ids for the turn.” |
| **Source cache** | Persisted JSON snapshot of a **source** (see **Storage** / `SourceCacheViz`). | “**Source cache** is written by background runners.” |

---

## 2. Terms to avoid or qualify (ambiguous “agent”)

| Avoid | Use instead |
|-------|-------------|
| “The Well of Souls agent” (product/UI) | **Well of Souls**, **personality rule generator**, or **Context tool** (once moved to Context tab). |
| “Agent” for any LLM call | Name the pipeline: **Ollama generation**, **avatar chat pipeline**, **Well of Souls generator**. |
| “Agent” for Cursor / Copilot | **Cursor agent**, **AI assistant**, or **subagent** — never unqualified “agent” in docs about development workflow. |
| “User agent” (HTTP) | Spell out **HTTP user-agent** or **browser user-agent** if you must mention it; never shorten to “agent” alone. |

---

## 3. Allowed special cases

- **LLM system prompts** may use in-fiction roles (“You are a meta-agent …”) inside strings; that does **not** define product terminology. Prefer **meta-prompt** or **persona line** in code comments describing those strings.
- **TypeScript `Agent`** interface ([`types/index.ts`](../src/types/index.ts)): use **Agent record** or **`Agent` type** in docs when distinguishing from SPEC “Agent.”
- **SPEC.md** remains the source of truth for **Agent Layer** and named agents; this guide aligns docs and UI with SPEC, not the reverse.

---

## 4. Capitalization quick rules

- **Avatar** — capitalize when meaning the product concept or a named avatar; “avatar” lowercase only in generic phrases (“avatar bubble”).
- **Agent** — capitalize when referring to SPEC architecture or a named agent (“Active Task Agent”). Use **background agents** (lowercase) for the general category in running text.
- **Switchboard** — treat as a proper name.

---

## 5. Parallel development (Cursor and humans)

Features can advance **in parallel** when workstreams touch different files or clearly separated layers.

**Suggested splits:**

| Workstream | Typical touchpoints | Notes |
|------------|---------------------|--------|
| Ollama / local LLM | `src/services/ollama.ts`, `src-tauri/src/ollama.rs`, header badges | Coordinate on `ollama.rs` command signatures. |
| Chat / provenance / Rules | `avatarAgents.ts`, `App.tsx`, `types`, `switchboard`, `appStore` | Single owner for `ConversationMessage` shape. |
| Context / Well of Souls | `App.tsx` context panel, `WellOfSouls.tsx`, `AppContext`, `situationContext` | Agree `SituationContext` fields before branching. |
| Docs only | `PROGRESS.md`, `SPEC.md`, `docs/` | Safe parallel; merge conflicts usually trivial. |

**Using multiple Cursor agents (Composer / subagents):**

1. **One workstream per agent** — e.g. Agent A: Rust Ollama tri-state; Agent B: PROGRESS + style guide; Agent C: Context tab UI.
2. **Define interfaces first** — types in `src/types`, Tauri command names, and `sendMessage` signature so branches do not fight.
3. **Short-lived branches or workspaces** — Git worktrees or separate branches per feature; merge when interfaces land.
4. **Handoff file** — Use `HANDOFF_TOMORROW.md` (or dated handoff) so the next session knows what is in flight and what is merged.

---

## 6. Where this guide applies

- User-visible strings and `title` / `aria-label` attributes.
- File-top comments in `src/services/*` that describe architecture.
- `SPEC.md`, `PROGRESS.md`, `docs/IMPLEMENTATION_ROADMAP.md` (phased roadmap), `TECHSPEC.md`, `docs/PLATFORM_PERSISTENCE.md` (durable platform ids), `README.md`, and handoff docs.

Code identifiers (`runAvatarAgent`, `BackgroundAgentTask`) stay as-is for stability; new public APIs should follow this vocabulary in JSDoc.

### Code comments aligned with §2

Comments in [`wellOfSoulsPrompt.ts`](../src/services/wellOfSoulsPrompt.ts), [`defaultAvatars.ts`](../src/data/defaultAvatars.ts) (Switchboard record), and [`types/index.ts`](../src/types/index.ts) (`ConversationMessage`) use this vocabulary.

---

## 7. UI approval (layout and visual choices)

Aligned with **SPEC.md** § Behavioral Instructions (layout). **Shipped** UI in the repo is treated as **collectively approved**. **New** work that changes layout structure, adds major surfaces, or departs from established patterns should involve the user. Iterative tweaks that stay consistent with existing patterns do not require a separate sign-off each time.

---

## 8. Session log category namespaces

Two families appear in the in-app log:

| Namespace | Form | Emitted by | Purpose |
|-----------|------|------------|---------|
| **Platform** | `platform_<event>` (prefix from `PLATFORM_LOG_CATEGORY` in `constants.ts`) | [`platformLog`](../src/services/platform/platformLog.ts) | Runners, store, scheduler, draft pipeline, cache I/O, etc. |
| **Contract** | `contract:<name>__<event>` | [`contractLog`](../src/services/sessionLog/contractLog.ts) | Monitor contracts; **`<name>` must match** the string after `monitor:` in the claimant’s `systemTags` (e.g. `monitor:source_runner:email` → `source_runner:email`). The Storage visualizer uses this to join log lines to the Background contract table. |
| **Tool Workshop** | `tool_workshop` | [`refiner.ts`](../src/services/toolWorkshop/refiner.ts), [`AppProvider`](../src/context/AppProvider.tsx) | Refiner invocations and outcomes; distinct from chat/tool execution logs. |

**Term:** **Workshops** — header checkbox that replaces the chat column with a hub: **Tool** (telemetry, refiner, addenda), **Unmet Needs** (capability queue), **Source** (Cursor handoff for `new_source` items), **Projects** (world-metadata project list and projects context-depth slider—moved out of the **Context** panel). See [WORKSHOPS.md](./WORKSHOPS.md).

**Term:** **Context** panel — connector tabs (email, calendar, contacts), user profile, WV log, WoS; **not** the primary place for the shared **projects** list anymore (use Workshops → Projects).

**Term:** **Tool Workshop** — the **Tool** sub-tab under Workshops: tool-call telemetry (including optional **`resultPreview`** and intent-quality fields on successes), optional Ollama **refiner** proposals, and user-approved **addenda** appended **inside the Tool protocol** section after the static profile block. See [TOOL_WORKSHOP.md](./TOOL_WORKSHOP.md).

**Term:** **Unmet Needs** — persisted queue of capability gaps; **Source handoff** — markdown copied for out-of-app connector work. See [UNMET_NEEDS.md](./UNMET_NEEDS.md), [SOURCE_WORKSHOP.md](./SOURCE_WORKSHOP.md).

---

## 9. Platform durable identifiers

On-disk paths, Tauri `invoke` names, `localStorage` keys, the platform log prefix, and the default system avatar id for attribution are **listed in one place** in [`PLATFORM_PERSISTENCE.md`](./PLATFORM_PERSISTENCE.md) and in [`src/services/platform/constants.ts`](../src/services/platform/constants.ts). Prefer updating those when renaming persistence, rather than scattering ad hoc strings in call sites.
