---
name: avatars-gui-quickstart
description: >-
  Maps the Avatars React shell (layout, overlays, content model, App.css) and
  gives a short workflow for sidebar, modals, and avatar-builder UI. Use when
  changing src/app/, shell components under src/components/, portrait or roster
  UI, AvatarBuilderModal, App.css layout, or Vite/Tauri frontend behavior.
---

# Avatars GUI quickstart

## When to use

- Touching **layout**, **sidebar**, **modals/overlays**, **chat shell**, or **global CSS** in this repo.
- Adding or moving controls between **Primary Avatars** and **Avatar builder**.
- Before asking the agent to “just tweak the UI” without re-explaining the architecture.

## Five-minute orientation

| Concern | Where |
|--------|--------|
| Main composition | `src/App.tsx` |
| Modals / overlays | `src/app/AppOverlays.tsx` → `AvatarBuilderModal`, session log |
| Primary avatar column | `src/app/PrimaryAvatarSidebar.tsx` |
| View model (most UI state, portrait file pipeline, builder) | `src/app/useAppContentModel.ts` |
| Portrait read path | `src/services/avatarPortrait.ts` (`getAvatarPortraitSrc`, `readPortraitFileAsDataUrl`) |
| Builder form | `src/components/AvatarBuilderModal.tsx` |
| Types / persisted shape | `src/types/index.ts` (`SituationContext`, `Avatar`, `AvatarAppearance`) |
| Styles | `src/App.css` (search `avatar-`, `avatar-builder-`, etc.) |

Components consume **`useAppContentView()`** from `src/app/appContentViewContext.tsx` — one large value object from `useAppContentModel`.

### Portrait data flow

Hidden `<input type="file" accept="image/*">` → `openPortraitFilePicker(avatarId)` → `handlePortraitFileChange` → `patchSituationContext({ avatarPortraitSrcById })`. Display merges session override and `appearance.portraitUrl` via `getAvatarPortraitSrc`.

## Workflow checklist

1. **Locate JSX** — Grep the user-facing string or class name; open the component.
2. **Find state** — If not local `useState`, trace into `useAppContentModel` (`patchSituationContext`, `useCallback` handlers).
3. **Types** — Confirm fields on `SituationContext` / `Avatar` in `src/types/index.ts`.
4. **CSS** — Add or extend classes beside the same feature family in `App.css`; match spacing/typography of neighbors.
5. **Verify** — After substantive UI changes, follow [.cursor/skills/avatars-capability-smoke/SKILL.md](../avatars-capability-smoke/SKILL.md) (`npm run verify`, short manual smoke).

## Worked example: portrait in builder + slimmer sidebar

This recipe matches the implemented pattern in the repo.

### Reuse file picking (edit mode)

One hidden file input stays in `PrimaryAvatarSidebar` (always mounted with the shell). The builder calls `openPortraitFilePicker(avatarId)` so the same `handlePortraitFileChange` runs. Avoid a second hidden input for **edit** unless you intentionally duplicate the read/patch logic.

### Seed / new avatar (no id until save)

The builder uses a **local** hidden file input and `readPortraitFileAsDataUrl`; chosen bytes stay in modal state until **Save**. `onSave` receives an optional `seedPortraitDataUrl`; `handleAvatarBuilderSave` patches `avatarPortraitSrcById[newAvatar.id]` in the same `patchSituationContext` as `userAvatars`.

### Builder UI

For `initial.kind === "edit"`, show preview + “Choose image…” + “Remove” + file error (same behavior as sidebar). For `kind === "seed"`, show optional portrait pick + preview before save.

Props are wired through `AppOverlays` from the view model (`openPortraitFilePicker`, `clearPortrait`, `portraitFileError`, `avatarPortraitSrcById`). Edit mode reuses the sidebar’s hidden file input via `openPortraitFilePicker(avatarId)`.

### Slimmer sidebar

When `getAvatarPortraitSrc(...)` is truthy for an avatar, the expanded **Portrait** section shows the preview only (no Choose/Remove in the column); use **Edit in builder…** to change or remove.

## Additional resources

- Smoke / regression: [avatars-capability-smoke](../avatars-capability-smoke/SKILL.md)
