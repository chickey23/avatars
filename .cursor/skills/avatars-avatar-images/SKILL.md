---
name: avatars-avatar-images
description: Explains and edits avatar portrait images in the Avatars React shell, including image selection, builder preview, headshot repositioning, magnification/zoom, persisted portrait metadata, and all portrait render locations. Use when the user mentions avatar images, portraits, headshots, image chooser, crop, repositioning, magnification, zoom, object-position, or avatar picture display.
---

# Avatars Avatar Images

## When to use

Use this for changes or explanations around avatar portrait images.

Trigger phrases include:
- "avatar image"
- "portrait"
- "headshot"
- "image chooser"
- "reposition"
- "crop"
- "magnification" / "zoom"
- "picture in the avatar card"
- "Talk to avatar image"

## Mental model

Avatar portraits are user-selected images rendered into circular slots with CSS `object-fit: cover`. The app stores:
- the image source itself
- the focal point for `object-position`
- the magnification scale for CSS `transform: scale(...)`

The builder owns the editing controls. Other shell surfaces only render the saved settings.

## Key files

- `src/services/avatarPortrait.ts` - portrait helpers, file-size limit, source resolution, position normalization, scale normalization, CSS formatting helpers.
- `src/components/AvatarBuilderModal.tsx` - image chooser UI, preview, reposition sliders, zoom slider, reset button, seed-avatar local portrait state.
- `src/app/useAppContentModel.ts` - hidden edit-mode file input, `handlePortraitFileChange`, `clearPortrait`, and `handleAvatarBuilderSave` persistence.
- `src/app/AppOverlays.tsx` - passes persisted portrait maps into `AvatarBuilderModal`.
- `src/app/PrimaryAvatarSidebar.tsx` - primary roster and pop-in portrait rendering.
- `src/app/ChatMainPanel.tsx` - chat message portrait and `Talk to` picker rendering (`chat-avatar-picker` / `chat-avatar-picker-img`; the picker can be collapsed via the tray chrome row, `talkToTrayOpen` on the view model).
- `src/types/index.ts` - `SituationContext` persisted fields.
- `src/App.css` - portrait slot, chooser, slider, and reset-button styling.
- `src/services/avatarPortrait.test.ts` - unit tests for portrait helper behavior.

## Persisted fields

In `SituationContext`:
- `avatarPortraitSrcById?: Record<string, string>` stores local data URLs or override URLs by avatar id.
- `avatarPortraitPositionById?: Record<string, AvatarPortraitPosition>` stores `{ x, y }` focal percentages from `0` to `100`; default is `{ x: 50, y: 50 }`.
- `avatarPortraitScaleById?: Record<string, number>` stores magnification; supported range is `0.5` to `2`, default `1`.

Do not put user-chosen portrait bytes on `Avatar.appearance`. Built-in/default image URLs may still live on `appearance.portraitUrl`; user overrides belong on `SituationContext`.

## Current portrait flow

Edit existing avatar:
1. `AvatarBuilderModal` calls `openPortraitFilePicker(avatarId)`.
2. The hidden input in `useAppContentModel` fires `handlePortraitFileChange`.
3. The selected file is read with `readPortraitFileAsDataUrl`.
4. `patchSituationContext` writes `avatarPortraitSrcById[avatarId]` and resets framing to centered `1x`.
5. Builder Save writes any changed `avatarPortraitPositionById` and `avatarPortraitScaleById`.

Create new avatar from seed:
1. `AvatarBuilderModal` uses its local hidden file input.
2. The image data URL, position, and scale stay in modal state until Save.
3. `handleAvatarBuilderSave` persists image source and framing for the new avatar id.

Remove portrait:
- `clearPortrait(avatarId)` removes source, position, and scale metadata for that avatar.

## Rendering rule

Whenever rendering a portrait image, apply all three helpers together:

```tsx
const objectPosition = getAvatarPortraitObjectPosition(
  situationContext.avatarPortraitPositionById?.[avatar.id]
);
const transform = getAvatarPortraitTransform(
  situationContext.avatarPortraitScaleById?.[avatar.id]
);

<img
  src={portraitSrc}
  className="avatar-portrait-img"
  style={{
    objectPosition,
    transform,
    transformOrigin: objectPosition,
  }}
/>
```

Use the surface-specific image class when needed:
- `avatar-portrait-img` for sidebar and builder.
- `message-avatar-portrait-img` for chat messages.
- `chat-avatar-picker-img` for the `Talk to` picker.

## Editing workflow

1. Read `src/services/avatarPortrait.ts` first for existing helper names and ranges.
2. If adding new framing metadata, add it to `SituationContext` in `src/types/index.ts`.
3. Thread props through `AppOverlays` only if the builder needs the metadata.
4. Keep image editing controls in `AvatarBuilderModal`.
5. Apply render helper output consistently in every portrait surface.
6. Update or add helper tests in `src/services/avatarPortrait.test.ts`.
7. Check touched-file diagnostics.
8. For substantive UI changes, follow `avatars-capability-smoke` and run `npm run verify`.

