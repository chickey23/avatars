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
| **Context scoring agent** | SPEC-defined background agents that score connector items (email → calendar → contacts). | Per SPEC § Context scoring agents. |
| **Switchboard** | Coordination layer (`switchboard.ts`): relevance, cascade, `distributeAndRespond`. Often paired with “Switchboard Agent” in SPEC. | “The Switchboard selects responders.” |

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
- `SPEC.md`, `PROGRESS.md`, `docs/IMPLEMENTATION_ROADMAP.md` (phased roadmap), `TECHSPEC.md`, `README.md`, and handoff docs.

Code identifiers (`runAvatarAgent`, `BackgroundAgentTask`) stay as-is for stability; new public APIs should follow this vocabulary in JSDoc.

### Code comments aligned with §2

Comments in [`wellOfSoulsPrompt.ts`](../src/services/wellOfSoulsPrompt.ts), [`defaultAvatars.ts`](../src/data/defaultAvatars.ts) (Switchboard record), and [`types/index.ts`](../src/types/index.ts) (`ConversationMessage`) use this vocabulary.
