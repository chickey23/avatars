# Distribution builds

Some fields exist so a **shipped** or **locked-down** build can restrict editing without changing core types:

- **`Avatar.uneditable`** — When `true`, the app should not offer the avatar builder (or other destructive editors) for that avatar. Omit the field or set `false` for normal development; a distribution could set `uneditable` on bundled primaries.

- **`SituationContext.builtinAvatarEdits`** — Persists full snapshots of built-in avatars when the user edits them locally. Distribution packages may ship without prior edits; user data still merges the same way.

Rule prompts prefer **`ruleBlockIds`** (individual blocks from the global library); **`ruleSetId`** remains a legacy grouping for older data.
