---
name: avatars-owner-stewardship-terms
description: >-
  Defines Avatars product vocabulary for user vs avatar project ownership vs
  perpetual stewardship (monitors, Workshops → Stewardship). Instructs agents to
  use terms consistently and to call out mixed or misleading wording in UI,
  comments, docs, and prompts. Use when the user mentions owner, stewardship,
  steward, project owner, ownerAvatarId, terminology, naming, or confusion
  between projects and operational duties.
---

# Avatars Owner And Stewardship Terms

## When to use

Read this skill when:

- Writing or reviewing **user-facing copy**, **tool/prompt text**, **comments**, or **docs** that mention owners, stewardship, projects, or the human operator.
- The user asks to align vocabulary, fix confusing labels, or distinguish **project assignment** from **Stewardship workshop** duties.
- Implementing features that touch **`ownerAvatarId`**, **monitor tags**, or **project lifecycle** language.

For **how** stewardships and capabilities work (tags, workshop UI, monitors), use **`avatars-stewardships-capabilities`**; this skill only fixes **what words mean** and **when to flag inconsistency**.

## Canonical vocabulary

Use these meanings consistently in explanations and new product-facing strings:

| Term | Meaning |
|------|--------|
| **User** | The **human** using the application — not an avatar. |
| **Owner** (of a **project**) | The **avatar** assigned responsibility for that **in-app project**. Used as the primary key to match in discussions and to inform prompts (which avatar “owns” that project). Maps to platform **`ownerAvatarId`** on the project record. Projects have a **lifecycle** and can reach **completion**. |
| **Stewardship** / **steward** | **Operational**, **perpetual** duties that keep the app functioning (monitors, source runners, schedulers, etc.). **Not** the same thing as owning a project. Most stewardships are **not** tied to a single project’s lifecycle. Assignments live under **Workshops → Stewardship** via **`monitor:<name>`** tags on avatars. |

**Summary:** *User* authors and operates the app; an avatar **owns** a **finite project**; avatars **steward** **ongoing processes** (monitors / tool governance), usually without a one-to-one project row.

## Code vs vocabulary (legacy naming)

The platform store field **`ownerAvatarId`** on `PlatformProjectRecord` means **project owner avatar** in the sense above. Older comments sometimes call that avatar a **“steward”** of the project — that is **project-scoped stewardship language**, not the same as **Stewardship** in the workshop (monitor duties).

When editing **`src/services/platform/store.ts`** or call sites, prefer vocabulary that matches this skill: e.g. **“project owner”** or **“avatar owner”** for `ownerAvatarId`, and reserve **“Stewardship”** for **monitor / workshop** duties unless you are deliberately describing one avatar’s relationship to a single project.

## Inconsistent usage — call it out

When you notice any of the following, **mention it explicitly** to the user (or fix it if the task is to correct copy):

1. **Calling a monitor duty a “project”** or implying every stewardship maps to a project row — false for most monitors (email runner, staleness watcher, etc.). Only some monitors (e.g. unassigned projects) are project-adjacent.
2. **Calling `ownerAvatarId` “stewardship”** in user-facing text without clarifying **project** scope — blurs **Workshops → Stewardship** (perpetual) with **project ownership** (lifecycle).
3. **“Owner” without domain** — ambiguous. Prefer **“project owner”** (avatar + project) vs **capability owner** / **tool owner** (see `tool_owner:` tags in the other skill) vs **user**.
4. **“Steward” for the human** — the user is the **user**, not a steward.
5. **Equating completion of a stewardship with completion of a project** — stewardships are intended as ongoing operational roles; projects complete.

## Quick anchors in the repo

- **Project owner (avatar):** `PlatformProjectRecord.ownerAvatarId`, `ensureProjectTaskForAvatar` in `src/services/projectAvatarLink.ts`, Workshops → Projects, and the **ASSIGN PROJECT OWNER** sidebar block (`assignableProjectsList`, `handleAssignTask`) in `src/app/PrimaryAvatarSidebar.tsx` / `useAppContentModel.ts`.
- **Stewardships (monitors):** `getAvatarStewardships`, `buildStewardshipWorkshopRows` in `src/services/avatarOperations.ts`, `src/components/StewardshipWorkshopPanel.tsx`.
- **Human user:** `authorUserId: "user"` on platform projects; user profile / worldview elsewhere — not `ownerAvatarId`.

## Related skill

- **[`avatars-stewardships-capabilities`](../avatars-stewardships-capabilities/SKILL.md)** — implementation map, UI rules, and execution model for monitor and tool capabilities.
