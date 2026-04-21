# Avatar roster, executor, and pop-in panel

## Overview

Primary avatars are ordered by **persisted roster scores** (integers **0–100**) in `SituationContext.avatarRosterPriorityScoreById`, not by legacy `avatars_avatar_popularity_v1` (removed on first roster init).

- **Sort:** descending score, ties broken by **avatar id** (lexicographic).
- **Core roster:** first `N` avatars after that sort, where `N = primaryAvatarSlotCount` (clamped to catalog size).
- **Executor:** first id in the core list after sort, unless `executorOverrideAvatarId` is set and still refers to a catalog avatar.
- **Override lifecycle:** persisted on context for UX; cleared when the user **changes selection** (toggle / set selected ids) or **reorders the core roster** via drag-and-drop scores.

Implementation lives under [`src/services/avatarRoster/`](../src/services/avatarRoster/).

## Score rules

- **Default:** avatars without an entry use `DEFAULT_ROSTER_SCORE` (50).
- **+1 bump (capped):** `applyScoreDeltaWithCap` — if a bump would exceed 100, every **other** avatar with score **≥ 1** loses 1 first; scores at **0** are not deflated.
- **Unhelpful:** `applyUnhelpfulDecrement` applies **−1** (may go **1 → 0**).
- **Drag reorder (core only):** dropping updates scores via `scoresFromCoreOrder` (top of list gets the highest assigned values within the cap rules).

## Pop-in panel

When `userFocus.project.id` is set and at least one avatar has an **active** long-term task with matching `projectId`, the sidebar shows a **Project team** strip. Clicking an entry:

- sets `executorOverrideAvatarId` to that avatar;
- applies **+1** roster score **at most once per focused project per avatar** (tracked in UI memory for that focus).

Pop-in avatars are also **merged into Switchboard responder ids** for user turns (in addition to core routing), and the runtime avatar list passed to `distributeAndRespond` includes them so `runAvatarAgent` can resolve them.

## Chat pipeline

- `processUserTurn` sets ephemeral `executorAvatarIdForTurn` from `resolveExecutorAvatarId` before `distributeAndRespond`.
- Switchboard **merges** pop-in ids into responders and **orders** each wave so the executor runs first when present.
- `stripEphemeralFields` removes `executorAvatarIdForTurn` before persistence.

## Tools and prompts

- **Executor** (`executorAvatarIdForTurn === avatar.id`): prompt emphasizes creating new tracked projects via `world_metadata.patch_projects` when appropriate.
- **Participants:** prompt narrows project-tool scope; **execute** denies `world_metadata.patch_projects` keys that introduce **new** project ids when `executorAvatarId` is set on the turn meta and the caller is not that executor. Avatars may still patch **existing** ids for **managed** projects (active long-term task with that `projectId`).

## Builder

[`AvatarBuilderModal`](../src/components/AvatarBuilderModal.tsx) includes a **0–100** roster field; save updates `avatarRosterPriorityScoreById` for that avatar id.
