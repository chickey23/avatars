# Agent reliability: harness engineering vs convention hooks

This note compares two 2026 write-ups that argue the same direction from different angles: **reliability comes from architecture and enforcement outside the model**, not from endlessly refining prompts. It ends with how that maps to the Avatars codebase.

**Sources**

- [Harness Engineering: The Architecture Layer That Makes AI Agents Actually Work in Production](https://mindwiredai.com/2026/05/13/harness-engineering-ai-agents-2026/) (MindWired AI, 2026-05-13) — referred to below as **MindWired**.
- [Hook-Based Context Injection for AI Coding Agents](https://andrewpatterson.dev/posts/agent-convention-enforcement-system/) (Andrew Patterson, 2026-03-21) — referred to below as **Patterson**.

An earlier plan referenced a Reddit thread on the same theme; automated fetch of that URL returned 403, so this synthesis uses MindWired as the alternate source for the “stop prompt-engineering your way out of it” line of argument.

---

## One-paragraph summaries

**MindWired** popularizes **harness engineering**: whenever an agent misbehaves, the response is not “write a better prompt” but **add a constraint that makes the mistake structurally hard to repeat**. The harness is everything except the model—orchestration, state, retries, quality gates, session boundaries—summarized as **Agent = Model + Harness**. The article separates **prompt engineering** (single-turn), **context engineering** (what tokens are in the window across turns), and **harness engineering** (resets, handoffs, phase gates). It stresses classical CS primitives (explicit task states, idempotency, DAGs, priority queues, dead-letter handling), a **dispatcher** that assigns work instead of the LLM self-prioritizing, **retry policies** fixed in code, and **quality gates** as checklists outside the LLM. It includes a four-block prompt template (role/scope, harness rules, per-task spec, structured response) to keep the *coding* agent inside those rails.

**Patterson** targets **AI coding agents** editing a repository. Early session instructions **fade** as the context window fills (“lost in the middle”); documentation alone yields weak convention adherence. The fix is a **three-tier system**: **hot memory** (a concise `AGENTS.md` every session), **cold memory** (small leaf docs injected only when editing relevant paths), and **runtime enforcement** via **PreToolUse** and **PostToolUse** hooks—blocking bad **Write** paths before files exist, injecting matching `## Inject` sections in recency-favorable order (**all-matches** routing, general→specific), then **grep-based** validation with **exit 2** so the agent must fix violations before continuing. Prerequisites: conventions must already exist; checks should not fire on hundreds of legacy violations; hook config must be **committed** so worktrees inherit behavior.

---

## Overlap in techniques

- **Anti-prompt-escapism:** Both treat “smarter prompts” as insufficient for production-grade behavior; the system must encode rules and outcomes the model does not re-decide each time.
- **Separation of concerns:** The LLM does **judgment / drafting / interpretation**; deterministic code does **routing, retries, validation, file placement, and sequencing**.
- **Explicit pass/fail gates:** MindWired uses compile/tests/schema checklists; Patterson uses **blocking** structural checks and post-edit **arch-validate** patterns—both are quality gates outside the model.
- **Scope discipline:** MindWired’s per-task “files in scope”; Patterson’s **structureCheck** and path rules narrow what may be created or where it may live.
- **Multi-session drift:** MindWired emphasizes wrong retries and duplicate work without state/idempotency; Patterson emphasizes **instruction fade** and inconsistent patterns across agents and sessions without reinforcement at edit time.
- **Hooks as shared surface:** MindWired lists hook-capable tooling; Patterson specifies a **middleware-style** PreToolUse pipeline (structure, optional dedup advisory, code context) plus PostToolUse enforcement.

---

## Distinctions (keep both mental models)

| Dimension | MindWired harness | Patterson convention system |
|-----------|-------------------|----------------------------|
| **Primary problem** | Autonomous product/agent loops in production | Contributor coding agents violating repo architecture |
| **Center of gravity** | Task lifecycle: dispatch, backoff, DLQ, idempotency | Doc + hook lifecycle: inject conventions, block bad writes, grep after edit |
| **Main artifacts** | DB task table, dispatcher, policies, logs | `AGENTS.md`, `docs/**` leaf files with `## Inject`, `inject-context.mjs`, `arch-validate.sh`, committed `.claude/settings.json` |
| **Token timing** | Names context engineering; focuses less on *where* in the window rules sit | Optimizes **when** conventions appear (start of session vs immediately before edit for recency) |
| **Team handoff** | Pasteable multi-block prompt aligned to harness concepts | Runnable scripts + routing tables + test harnesses for hooks |

The two are **complementary**: MindWired is the **runtime orchestration harness** around agent work; Patterson is a **development harness** keeping human or AI editors aligned with repo conventions.

---

## How this applies to Avatars

**What already acts like a harness (MindWired-shaped)**

- **Durable platform state** — projects and tasks, reconciliation, and scheduling live under [`src/services/platform/`](../src/services/platform/) (for example [`store.ts`](../src/services/platform/store.ts), [`scheduler.ts`](../src/services/platform/scheduler.ts)). That is the closest analogue to an explicit task table + dispatcher: work is **named, persisted, and walked** on ticks rather than only implied in chat.
- **Background and switchboard machinery** — background agents, waves queue, monitors, and session logging (see [`TECHSPEC.md`](../TECHSPEC.md) structure) provide **process boundaries, telemetry, and repeated system behavior** outside a single model turn.
- **Tool protocol and repair** — [`src/services/avatarAgents.ts`](../src/services/avatarAgents.ts) and related agentic tool plumbing encode **structured tool use and guarded repair** instead of hoping the model self-corrects from prose alone.
- **Quality gate** — `npm run verify` and the [avatars-capability-smoke](../.cursor/skills/avatars-capability-smoke/SKILL.md) skill describe the project’s bar for “done” after substantive changes.

**Where MindWired-style thinking helps next**

- Any flow where **the model chooses retry semantics, ordering, or “done”** without a persisted state transition is a candidate to push into **explicit status fields, single-fire guards, or logged handoffs**—aligned with idempotency and “dispatcher assigns work” rather than self-prioritization.
- **Observability**: harness-level logs (task id, transition, retry count) remain the first place to debug when “the model did something odd” in a multi-step feature.

**What already acts like Patterson’s system (convention-shaped)**

- **[`TECHSPEC.md`](../TECHSPEC.md)** — long-lived, rebuild-from-scratch **hot**-style truth for the repo.
- **[`.cursor/skills/`](../.cursor/skills/)** — **on-demand, domain-scoped** guidance (cold memory analogue) for audio, GUI, platform tasks, context sources, etc.

**Optional Patterson-style additions (if you want stronger editor alignment)**

- A short root **`AGENTS.md`** (or equivalent) distilled from TECHSPEC: layer map, where new UI vs services vs Tauri code goes, and “run verify after substantive edits”—without duplicating the whole spec.
- **Leaf notes** for high-churn areas (for example `src/services/platform/`, `src/app/`) with a small **Inject** section listing non-obvious invariants and canonical file references—Patterson’s “if the agent can infer it from code, omit it.”
- **Hooks** (PreToolUse / PostToolUse) if you standardize on a hook-capable coding agent: path allowlists for `src/`, and lightweight checks for patterns you already care about in review. Patterson’s prerequisite applies: only add **blocking** checks when baseline violations are near zero.

**Summary**

Use **MindWired** to harden **runtime behavior** (tasks, state, idempotency, fixed policies, gates). Use **Patterson** to harden **contribution consistency** (always-on + just-in-time conventions, blocking bad edits). Avatars already leans harness-ward in platform and agent services; it leans convention-ward via TECHSPEC and Cursor skills. Closing the gap is mostly **documentation placement, optional hooks, and any ambiguous dispatch/retry paths**—not longer avatar system prompts alone.
