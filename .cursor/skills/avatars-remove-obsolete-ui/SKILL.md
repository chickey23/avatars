---
name: avatars-remove-obsolete-ui
description: Removes obsolete UI controls from the Avatars React shell and cleans up related model wiring, handlers, imports, and CSS. Use when the user asks to remove a header button, nav item, panel affordance, sidebar control, or other no-longer-needed UI element.
---

# Avatars Remove Obsolete UI

## When to use

Use this for small UI removals in the Avatars app, especially under `src/app/`, `src/components/`, or `src/App.css`.

Examples:
- Remove a header control
- Remove an obsolete nav item
- Remove a sidebar button or panel affordance
- Remove a no-longer-used modal entry point

## Workflow

1. Find the visible UI element.
   - Search for the user-facing label, CSS class, or handler name.
   - Start with `src/app/` and `src/components/`.

2. Trace the wiring before editing.
   - Identify props or context fields used only by the removed UI.
   - In this app, many shell components consume `useAppContentView()` from `src/app/appContentViewContext.tsx`.
   - Remove dead values from `useAppContentModel()` when they only exist for the removed UI.

3. Remove in layers.
   - Delete the JSX first.
   - Delete unused handlers, arrays, imports, and returned view-model fields.
   - Delete CSS selectors that only styled the removed UI.

4. Check for leftovers.
   - Search for the removed label, CSS class, handler name, and view-model field.
   - Confirm there are no remaining references before finishing.

5. Verify.
   - Run diagnostics on touched files.
   - For changes under `src/` or `src/app/`, follow `avatars-capability-smoke`: run `npm run verify`.
   - Manual smoke is optional for a tiny visual removal unless the user asks or the layout risk is non-trivial.

## Notes for this codebase

- `src/App.tsx` owns main composition.
- `src/app/AppHeader.tsx` owns the top header.
- `src/app/useAppContentModel.ts` returns the large view model consumed by shell components.
- `src/App.css` contains global shell styles.
- Avoid leaving unused fields in `AppContentViewValue`, because it is inferred from `useAppContentModel()`.
