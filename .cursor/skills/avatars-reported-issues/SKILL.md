---
name: avatars-reported-issues
description: >-
  Records and triages user-visible regressions in Avatars markdown docs (not
  SPEC deferred roadmap). Use when the user reports a bug, regression, broken
  UI flow, or wrong tool/chat combination; when filing or closing R-items in
  PROGRESS.md; or when adding a manual test row for a reported issue.
---

# Avatars reported issues

## When to use

- The user describes something that **used to work** or **should work** but fails in the app (regression or gap).
- You need to decide **where to log it** vs intentional **Deferred** work in `SPEC.md` / `PROGRESS.md`.
- You are adding or closing an **R-number** row in `PROGRESS.md` or a matching **`docs/TEST_PLAN.md`** row.

## What “reported issue” means (vs Deferred)

| Kind | Meaning | Where it lives |
|------|---------|----------------|
| **Reported issue** | Broken behavior or missing UX someone hit **now**; should be fixed or explicitly rejected | `PROGRESS.md` § **Reported issues (open)** + optional `HANDOFF_TOMORROW.md` watch line + `docs/TEST_PLAN.md` when reproducible |
| **Deferred** | Intentionally postponed product/roadmap work | `SPEC.md`, `PROGRESS.md` § Deferred, `HANDOFF_TOMORROW.md` § Deferred |

Do **not** file regressions only under Deferred; that hides broken state behind “later.”

## Instructions

### 1. Log the issue

1. Open [`PROGRESS.md`](../../PROGRESS.md) § **Reported issues (open)**.
2. Add a table row with the next **R** id (`R2`, `R3`, …): **Area**, **Summary** (expected vs observed in one line each), **Evidence to capture**.
3. If the repro is manual, add or extend a row in [`docs/TEST_PLAN.md`](../../docs/TEST_PLAN.md) and reference that id in the PROGRESS table (see **A14** + **R1** as the pattern).

### 2. Evidence (minimum)

Ask the user (or note from session) at least:

- **Steps** — avatar chosen, exact user message style, Ollama up/down.
- **Parse path** — **Model reply / tools parse**: `avatars_tools_v1` parsed or mismatch; **WV log** tool rows if any.
- **UI** — whether an in-thread **open creation** affordance appeared.

### 3. Handoff (optional)

While the issue is open, add a one-line bullet under [`HANDOFF_TOMORROW.md`](../../HANDOFF_TOMORROW.md) § **Reported issues (watch until fixed)** pointing to the **R** id and the TEST_PLAN row. Remove that bullet when the issue is closed.

### 4. Close an issue

Choose one:

- **Fixed** — implement the fix; remove the row from **Reported issues (open)** (or mark removed in the same edit); add a **Recent milestone bullets** note with date + short summary; keep or tighten the TEST_PLAN row as a regression guard.
- **Won’t fix / duplicate** — remove or strike the row; if the behavior is accepted, say so in a milestone bullet or Deferred with rationale.
- **Becomes roadmap** — if it was misclassified, move the write-up to Deferred / SPEC and remove from **Reported issues (open)** with a cross-link.

## Quick template (for chat or paste into PROGRESS)

```markdown
| R# | <component> | **Expected:** … **Observed:** … | Model reply/tools parse, WV log, session log ids if any; TEST_PLAN A# |
```

## Related

- Smoke / verify loop: [avatars-capability-smoke](../avatars-capability-smoke/SKILL.md)
- Dev cycle map: [`docs/DEVELOPMENT_CYCLE.md`](../../docs/DEVELOPMENT_CYCLE.md)
