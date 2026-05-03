---
name: avatars-platform-projects-tasks
description: >-
  Explains Avatars durable platform projects and tasks (JSON store), multi-step
  avatar-creation flow: complex task planner, automatic queue (workshop offers),
  fulfillment by roster name match, Context Tasks tab, and Situation focus.task.
  Use when changing or debugging src/services/platform/store.ts, ContextPanel
  Tasks tab, avatarCreationTaskExecution, avatarCreationTaskFulfillment,
  complexTaskPlanner monitor, or related UI and tests.
---

# Avatars platform projects, tasks, and task queue

## When to use

- Changing or debugging **durable projects/tasks** (not the same as `world_metadata.projects` alone).
- Multi-step **“create several named avatars”** flows, **synthetic review cards**, or **Creation workshop** offers tied to platform tasks.
- **Context column → Tasks** tab, **Focus** on a task, or **SituationFocus.task**.
- Anything involving **`requiredCapability.id === "avatar_creation"`**, **`workflowStatus`**, or **`completionEvidence`**.
- **See also:** For **single-turn chat** `avatars.workshop.open_draft`, **parse vs UI**, and **Creation workshop navigation** from a normal user message (not the platform task queue), use [**avatars-avatar-creation-chat-trace**](../avatars-avatar-creation-chat-trace/SKILL.md).

---

## Storage and scope

| Layer | Purpose | Typical path / API |
|--------|---------|---------------------|
| **Platform store** | Durable **projects** and **tasks** (workflow, capabilities, approval, evidence, history). | [`src/services/platform/store.ts`](../../../src/services/platform/store.ts) — persists under `%LOCALAPPDATA%/avatars/data/platform/` (see docs on platform persistence). |
| **World metadata projects** | User-facing catalogue of project titles/summary; synced **into** platform store additively. | [`world_metadata`](../../../src/services/worldMetadata/store.ts); not a full replacement for platform tasks. |
| **Situation context** | **`userAvatars`** — roster used to **verify** avatar-creation task completion (names). | [`getFullAvatarCatalog`](../../../src/store/avatarCatalog.ts) merges defaults + user avatars. |

**Project** = durable goal container (title, summary, steward `ownerAvatarId`, project `status` / `workflowStatus`, due/snooze, history).

**Task** = execution grain under a `projectId`: title, notes, `status` (`open` | `snoozed` | `done` | `cancelled`), **`workflowStatus`** (e.g. `open`, `waiting_for_user`, `done`, `cancelled`), `requiredCapability`, `approval`, `completionEvidence`, `history`.

---

## Concepts: project vs task

- Splitting **one user request** into work uses **projects** as the umbrella and **tasks** as repeatable steps (e.g. one task per named avatar).
- **`nextActor`** indicates who acts next (`avatar` | `user` | `platform` | `external`) when meaningful.
- The **scheduler** ([`scheduler.ts`](../../../src/services/platform/scheduler.ts)) emits due/snooze fires for **owned** schedulable items; platform task fulfillment for avatar creation uses a **separate scan** tied to **`userAvatars`** (see below).

---

## Multi-step avatar creation (Lexical planner → platform rows)

1. **`complex_task_planner` monitor** ([`complexTaskPlanner.ts`](../../../src/services/monitors/complexTaskPlanner.ts)): on **`user_turn`**, [`parseAvatarCreationPlan`](../../../src/services/complexTasks/avatarCreationPlanner.ts) detects phrases like “create three avatars named …”. It posts a **synthetic chat card** with **Create tasks** / **Not now**.
2. **Create tasks** builds **one platform project** and **one platform task per subject** (`Create avatar: {subject}`), with notes containing **`seedText` / `wikiQuery`** lines and `requiredCapability: avatar_creation`.

---

## Task queue (automatic and manual)

**Queue** here means **ordered avatar_creation tasks**, not the Waves queue.

1. **Selection:** [`selectNextQueuedAvatarCreationTask`](../../../src/services/avatarCreationTaskExecution.ts) picks the next **`open`** / **`ready`** task with parsed hints whose **project isn’t blocked** — no sibling in that project may be **`waiting_for_user`**, **`in_progress`**, or **`waiting_for_approval`** ([`projectHasActiveAvatarCreationStep`](../../../src/services/avatarCreationTaskExecution.ts)).

2. **Advancing:** [`advanceAvatarCreationTaskQueue`](../../../src/services/avatarCreationTaskExecution.ts) posts the **`postAvatarCreationWorkshopOffer`** card (with optional “Next in queue: …”) and moves the task to **`waiting_for_user`**.

3. **Monitor [`avatar_creation_task_runner`](../../../src/services/monitors/avatarCreationTaskRunner.ts):** listens **`startup`** + **`store_change`** and calls **`advanceAvatarCreationTaskQueue`** so new work is offered without only relying on manual **Execute**.

4. **Manual:** Context → **Tasks** calls [`executeAvatarCreationTaskById`](../../../src/services/avatarCreationTaskExecution.ts) (same execution path without the banner intro).

5. **Offer actions:** **`linkedPlatformTaskId`** ties the chat card to a platform row; **Not now** can cancel so the runner can proceed ([`avatarCreationOffer.ts`](../../../src/services/avatarCreationOffer.ts)).

---

## Automatic closure (fulfillment)

When a task is **`waiting_for_user`**, [`scanAvatarCreationTaskFulfillment`](../../../src/services/avatarCreationTaskFulfillment.ts) (invoked from [`AppProvider`](../../../src/context/AppProvider.tsx) on a **roster fingerprint** + **`PLATFORM_SCHEDULER_INTERVAL_MS`** tick) compares **expected name** (**`wikiQuery`** line in notes, else **`Create avatar:`** strip from title) to **`userAvatars[].givenName`** (**normalized equality**, no substring shortcut).

On match: **`updateTaskWorkflow` → done**, **`createTaskCompletionEvidence`**, **`publishPlatformEvent`** (`avatar_creation_task_satisfied`). The **audio bridge** may **`enqueueVoiceSnippet`** [`AUDIO_SNIPPET_IDS.avatarCreationTaskDone`](../../../src/services/audio/cueRegistry.ts). Store update triggers **`store_change`** monitors so **`avatar_creation_task_runner`** can offer the **next** **`open`** task.

---

## UI: Context column

- **`contextTasks`** in [`useAppContentModel.ts`](../../../src/app/useAppContentModel.ts): incomplete tasks from the platform store (not done/cancelled), sorted by project title / recency / title.
- **Tasks tab** in [`ContextPanel.tsx`](../../../src/app/ContextPanel.tsx): **Focus**, **Execute** (avatar_creation only when hints parse), **Cancel** (`workflowStatus` → cancelled).
- **Situation focus:** **`SituationFocus.task`** (`FocusItem`) — wired in [`situationContext.ts`](../../../src/services/situationContext.ts) for relevance strings.

---

## Key files (quick grep targets)

| Topic | Files |
|--------|--------|
| Store types / mutations | [`platform/store.ts`](../../../src/services/platform/store.ts) |
| Planner → tasks | [`complexTaskPlanner.ts`](../../../src/services/monitors/complexTaskPlanner.ts), [`avatarCreationPlanner.ts`](../../../src/services/complexTasks/avatarCreationPlanner.ts) |
| Offers + executes | [`avatarCreationOffer.ts`](../../../src/services/avatarCreationOffer.ts), [`avatarCreationTaskExecution.ts`](../../../src/services/avatarCreationTaskExecution.ts) |
| Fulfillment | [`avatarCreationTaskFulfillment.ts`](../../../src/services/avatarCreationTaskFulfillment.ts) |
| Monitors bootstrap | [`monitors/bootstrap.ts`](../../../src/services/monitors/bootstrap.ts) |
| Bus / sound | [`platform/bus.ts`](../../../src/services/platform/bus.ts), [`platformAudioBridge.ts`](../../../src/services/audio/platformAudioBridge.ts) |

---

## Verification

After substantive edits, run **`npm run verify`** and a short smoke per [.cursor/skills/avatars-capability-smoke/SKILL.md](../avatars-capability-smoke/SKILL.md).
