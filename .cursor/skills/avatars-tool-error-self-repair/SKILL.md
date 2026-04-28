---
name: avatars-tool-error-self-repair
description: Handles predictable Avatars tool-call failures by classifying error patterns, reframing failures as missing requirements, and applying a single guarded repair attempt for missing required args. Use when wave/workshop telemetry shows repeated tool errors, especially missing arguments.
---

# Avatars Tool Error Self-Repair

## Purpose

Use this skill to reduce recurring tool-call failures where the tool is correct but required args are missing. Prefer requirement-state framing over rule-violation framing.

Use when:

- Waves visualizer or Tool Workshop shows repeated tool errors.
- Errors are patterned and predictable across turns.
- Failures are mostly missing required fields/parameters.

Do not use when:

- Failure is permission/capability denial that needs eligibility changes.
- User request is fundamentally multi-step and should be decomposed into project/tasks first.
- Required values cannot be sourced from trusted context.

## Core principle

Translate failures into execution requirements:

- "missing projectId or title" => required fields missing.
- "missing body or to" => communication payload incomplete.
- "missing title or startAt" => schedule requirements incomplete.

Prefer wording such as "requirements not yet satisfied" or "needs user/context input" unless the failure is explicitly capability/policy-related.

## Workflow

### 1) Classify the failure

Capture:

- `toolId`
- `errorCode`
- `argsPreview` (non-secret)
- turn/user message id
- intent (if available)

Classify as one of:

- `missing_required_args`
- `parse_malformed`
- `permission_or_capability`
- `unknown_or_other`

### 2) Build requirement set

For `missing_required_args`, derive:

- required field names
- present field names
- inferable field values from trusted context
- unresolved fields requiring user input

### 3) Repair eligibility gate

Allow focused repair only if all are true:

- tool id is known and supported
- error is in known predictable missing-arg patterns
- no permission/capability denial on this attempt
- retry count is below cap (default: 1)
- candidate values come from trusted context or explicit user input

### 4) Run focused repair prompt

Constrain the call:

- same tool id only
- fill only missing required args
- keep already valid args unchanged
- output one valid `avatars_tools_v1` envelope
- if requirements remain unavailable, return explicit inability marker (no guessing)

### 5) Validate and execute

- Re-run deterministic validation/execution.
- Stop at retry cap.
- If still unresolved, emit unmet requirement state; do not continue looping.

### 6) Record and surface

Persist:

- initial failure
- repair attempt metadata
- final status
- unresolved requirement list (if any)

Surface user-facing status as missing prerequisites/requirements first.

## Known missing-field patterns (seed)

Keep synchronized with execution validators:

- `drafts.tasks`: `projectId`, `title`
- `drafts.calendar_event`: `title`, `startAt`
- `drafts.email_reply`: `body`, non-empty `to[]`
- `avatars.workshop.open_draft`: at least one of `seedText` or `wikiQuery`

## Guardrails

- Never invent ids, addresses, timestamps, or owners without evidence.
- Never bypass capability/ownership/permission checks.
- Never switch to a different tool during repair.
- Never exceed retry cap.
- Never suppress unresolved failure state.

## Self-correcting maintenance loop (required)

Update this skill as telemetry teaches better fixes:

1. Observe top recurring `toolId + errorCode + missing field set` clusters.
2. Add concrete patterns to "Known missing-field patterns".
3. Refine focused repair constraints for those patterns.
4. Add explicit disallow rules when a repair causes bad side effects.
5. Verify recurrence trend drops after changes.
6. Append a dated changelog note describing what was learned.

Escalation rule:

- If recurrence does not improve after two prompt-level iterations, stop adding prompt complexity and escalate to deterministic preprocessing, capability assignment, or task decomposition.

## Changelog

- 2026-04-28: Initial version for missing-required-args targeted repair and requirement-state framing.
