# Extending personality traits and AI rule blocks

Traits and rule blocks are **two separate lists**. The UI (avatar builder, Well of Souls, routing profile trait labels) reads from them automatically once you add entries. There is **no** automatic link between a trait `id` and a rule block `id`—pair them by naming and product intent.

## Personality traits

1. Edit [`src/theme/designTokens.ts`](../src/theme/designTokens.ts): append to `PERSONALITY_TRAITS` with a stable `id` and a short `label`.
2. The `PersonalityTraitId` type is inferred from that array—no manual union to update.
3. New traits appear in trait pickers and Well of Souls without further UI code.

## AI rule blocks

1. Edit [`src/data/aiRulesLibrary.ts`](../src/data/aiRulesLibrary.ts): append to `AI_RULE_BLOCKS` with a stable `id`, `title`, and one-paragraph `body` (actionable instructions for the model).
2. Treat the list as **append-only** when possible so existing saved `ruleBlockIds` on avatars keep meaning.
3. **Optional — named presets**: If you still use bundle defaults, add or adjust entries in `AI_RULE_SETS` so each `blockIds` array only references ids that exist in `AI_RULE_BLOCKS`.
4. **Built-in avatars**: Update [`src/data/defaultAvatars.ts`](../src/data/defaultAvatars.ts) `ruleBlockIds` and/or `traitIds` when defaults should include the new items.

## Well of Souls

Initial random selection is implemented in [`src/services/wellOfSoulsRandomInit.ts`](../src/services/wellOfSoulsRandomInit.ts):

- **Always included** at load: `global-brief` (Brevity), `tone-in-character` (Stay in character). Add ids there if a new block must always start checked.
- Other blocks: 50% each; traits: 25% each—independent toggles, still user-editable before Generate.

## Legacy `ruleSetId`

Avatars may still resolve rules via `ruleSetId` when `ruleBlockIds` is absent ([`src/services/avatarRules.ts`](../src/services/avatarRules.ts)). Prefer defining **blocks** and `ruleBlockIds` for new work; sets are legacy bundles.

## Sanity check after changes

- Run tests (`avatarRules`, etc.) and smoke-test: open AI rules library panel, avatar builder rule checkboxes, Well of Souls, and one chat turn to confirm prompts include new blocks.

## Related docs

- [`DISTRIBUTION.md`](DISTRIBUTION.md) — `uneditable`, `builtinAvatarEdits`, blocks-first routing in distribution contexts.
