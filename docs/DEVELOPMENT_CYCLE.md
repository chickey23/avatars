# Development and design cycle

**Non-normative.** This document does not override [SPEC.md](../SPEC.md). It names how to iterate (plan through reflection) and where to find detailed checklists. Product behavior and priorities remain in the spec, [PROGRESS.md](../PROGRESS.md), and [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md).

## Purpose

When a lot of code changes in the editor but the app is only opened occasionally, **capability drifts**—tests pass, but whole user-visible paths weaken. A short, repeatable loop keeps **build** tied to **use** and **goals** without duplicating the regression matrix in [TEST_PLAN.md](TEST_PLAN.md).

## The loop

- **Plan** — Define one clear outcome, success signals, and what is **out of scope** this cycle. Ground priorities in [SPEC.md](../SPEC.md) § Implementation Order, [PROGRESS.md](../PROGRESS.md), and the roadmap above.
- **Build** — Ship the smallest slice that can be **used** (not only compiled).
- **Test** — Run `npm run verify` (see [../package.json](../package.json), [../scripts/verify.ps1](../scripts/verify.ps1)) and any focused tests. For depth and manual rows, use [TEST_PLAN.md](TEST_PLAN.md).
- **Use** — Run the real app (Tauri is the default for a desktop truth check; see the smoke skill below). “Green tests” is not a substitute.
- **Evaluate** — Compare results to the success signals; note **regressions** explicitly.
- **Assess goals** — Briefly check alignment with the spec and roadmap; adjust backlog if the goal was wrong, not only if the code was wrong.
- **Reflect** — Capture what to **encode** next (see Cursor assets below, [HANDOFF_TOMORROW.md](../HANDOFF_TOMORROW.md), or [docs/CODEBASE_GUIDELINES.md](CODEBASE_GUIDELINES.md) when a convention solidifies).
- **Plan again** — Start the next cycle with a clean **plan** step.

## Map to this repo

| Need | Where |
|------|--------|
| What to run before release or after large changes (detailed matrix) | [TEST_PLAN.md](TEST_PLAN.md) |
| Structured Ollama tools, permissions, Tool Workshop | [AGENTIC_TOOLS.md](AGENTIC_TOOLS.md), [TOOL_WORKSHOP.md](TOOL_WORKSHOP.md) |
| Status, shipped items, “what’s next” | [PROGRESS.md](../PROGRESS.md) |
| Session snapshot, verification checklist, next-session TL;DR | [HANDOFF_TOMORROW.md](../HANDOFF_TOMORROW.md) |
| Phased product roadmap (A–G) | [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) |
| AI / Cursor **planning** tasks (separate from product spec) | [../.cursor/plans/](../.cursor/plans/) — see also SPEC “Document Roles” |

Do not treat `.cursor/plans` as a substitute for [SPEC.md](../SPEC.md); it is operational planning, not the canonical product document.

## Cursor: skills and rules (lightweight)

- **Rules** (`.mdc` under [`.cursor/rules/`](../.cursor/rules/)) — **Invariants** that apply when matching files are in context (globs in each file). They reduce repeated “don’t break X” chat context for stable conventions (e.g. Tauri allowlist, platform + audio patterns).
- **Skills** (e.g. [`.cursor/skills/avatars-capability-smoke/SKILL.md`](../.cursor/skills/avatars-capability-smoke/SKILL.md)) — **Procedures** the agent (or a human) runs when a situation matches: automated verify, launch, short manual smoke. Use especially before merge when risk is high; see that file for steps.

This repo includes:

- **[avatars-capability-smoke](../.cursor/skills/avatars-capability-smoke/SKILL.md)** — Capability smoke: verify, then Tauri (or Vite when truly web-only), then a short product checklist.
- **[avatars-audio-platform](../.cursor/rules/avatars-audio-platform.mdc)** — File-scoped invariants for `src/services/audio/`, `src/services/platform/`, and the listed Tauri entrypoints; points at [CODEBASE_GUIDELINES.md](CODEBASE_GUIDELINES.md) and [PLATFORM_PERSISTENCE.md](PLATFORM_PERSISTENCE.md) for details.

**Rules** answer “what must stay true in this part of the tree.” **Skills** answer “run this when finishing or verifying.”

## Optional cycle note (short)

Jot a few lines at the end of a cycle so the next plan step is grounded:

- **Goal** and success signals (what “done” meant).
- **What shipped** (or what did not, and why).
- **Verify / use** — e.g. `verify` ok, smoke path result, or pointer to a TEST_PLAN section exercised.
- **One reflection** — e.g. “encode in handoff,” “tighten rule for X,” or “no change.”

That note can live in your journal, a PR description, or an update to [HANDOFF_TOMORROW.md](../HANDOFF_TOMORROW.md) when you hand off.
