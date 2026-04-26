---
name: avatars-primary-avatar-column
description: Navigates and edits the Avatars primary avatar column, including avatar cards, magnifying-glass details, tabs, pending badges, portrait controls, and builder entry points. Use when the user mentions the avatar column, left column, Primary Avatars sidebar, avatar details, avatar magnifying glass, Match/Bio/Rules tabs, assigned projects, tags, interests, traits, or confusion between left and right in UI directions.
---

# Avatars Primary Avatar Column

## When to use

Use this for changes or debugging around the **Primary Avatars** column in the Avatars React shell.

Trigger phrases include:
- "avatar column"
- "left column"
- "Primary Avatars"
- "magnifying glass"
- "avatar details"
- "Match / Bio / Rules"
- "assigned projects, tags, interests, traits"
- directions where the user may say "left" or "right" while describing this sidebar

## Direction / landmark rule

The user may confuse left and right in typing or speech. Do not anchor only on the word "left" or "right".

Prefer concrete landmarks:
- "avatar column", "Primary Avatars", or "each avatar" means `src/app/PrimaryAvatarSidebar.tsx`.
- "magnifying glass" means the per-avatar details toggle in the avatar card toolbar.
- "Edit in Builder" means the builder CTA inside the expanded avatar detail panel.
- "Match", "Bio", and "Rules" mean the avatar detail tabs under the magnifying-glass details area.

If a request says left/right but also names a landmark, trust the landmark. Ask only when the landmark is missing or two UI areas could match.

## Key files

- `src/app/PrimaryAvatarSidebar.tsx` - avatar card JSX, magnifying-glass details, pending badges, portrait picker entry, project assignment UI.
- `src/app/useAppContentModel.ts` - shared shell state returned through `useAppContentView()`, including avatar detail expansion and tab state.
- `src/app/appContentViewContext.tsx` - provider/consumer boundary for the view model.
- `src/App.css` - sidebar, avatar card, detail panel, tab, chip, and builder button styling.
- `src/services/longTermTasks.ts` - `getProjectAssignmentsForAvatar()` for assigned project display.
- `src/theme/designTokens.ts` - `PERSONALITY_TRAITS` labels for `avatar.traitIds`.
- `src/types/index.ts` - `Avatar` fields such as `tags`, `interests`, `description`, `personality`, `assignedTasks`, and `traitIds`.

## Current data mapping

In avatar details:
- Match tab: assigned projects from `getProjectAssignmentsForAvatar(avatar.id, avatar.assignedTasks)`, plus `avatar.tags` and `avatar.interests`.
- Bio tab: `avatar.description` and `avatar.personality`.
- Rules tab: `avatar.traitIds`, displayed via `PERSONALITY_TRAITS` labels with raw ids as fallback.
- Edit in Builder: opens `AvatarBuilderModal` through `setAvatarBuilderInitial({ kind: "edit", avatar: { ...avatar } })` and `setAvatarBuilderOpen(true)`.

Assigned projects are derived from active long-term task rows. `avatar.assignedTasks` stores task ids, not project ids.

## Workflow

1. Start in `src/app/PrimaryAvatarSidebar.tsx`.
   - Search for the visible label, CSS class, or button title.
   - For the magnifying glass, look for `avatar-detail-toggle`.

2. Trace shared state through `useAppContentView()`.
   - Add or remove state in `src/app/useAppContentModel.ts` when the behavior must be shared across avatar cards.
   - Keep purely presentational grouping local to `PrimaryAvatarSidebar.tsx`.

3. Keep related UI placement stable.
   - Detail controls belong under the per-avatar magnifying-glass area.
   - `Edit in Builder` should remain below the detail/tab content unless the user explicitly asks to move it.
   - Do not confuse the per-avatar magnifying glass with the header gear/behavior panel.

4. Update styles beside the existing avatar selectors in `src/App.css`.
   - Reuse existing sidebar spacing, chip, and button patterns.
   - Avoid broad global selectors.

5. Verify.
   - Run diagnostics on touched files.
   - For substantive changes under `src/app/` or `src/App.css`, follow `avatars-capability-smoke`: run `npm run verify`.
