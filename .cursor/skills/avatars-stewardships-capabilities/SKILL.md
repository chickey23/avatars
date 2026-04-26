---
name: avatars-stewardships-capabilities
description: Explains and changes Avatars Stewardships and Capabilities: monitor-owned duties, tool grants, Rules-tab summaries, Avatar Builder operational roles, and Workshops → Stewardship. Use when the user mentions stewardships, capabilities, contracts, monitor ownership, tool_owner tags, allowedAgenticToolIds, operational roles, or the Stewardship workshop.
---

# Avatars Stewardships And Capabilities

## Core Terms

Use these product terms in user-facing UI and explanations:

- **Stewardships**: avatar-held operational duties backed by `monitor:<name>` tags in `Avatar.systemTags`. Examples: source runners, due/snoozed scheduler, unassigned project watcher, unclaimed stewardship warnings.
- **Capabilities**: avatar-held tool permissions backed by `tool_owner:<group>` tags and `allowedAgenticToolIds`. Examples: draft write tools, avatar creation workshop, Gmail body fetch, project metadata patching.
- **Contracts**: internal/developer wording only. Keep it for monitor registry names, `contract:` session-log categories, and durable docs where needed.

Treat Stewardships and Capabilities as related but distinct concepts: both attach operational authority to avatars, but Stewardships decide who owns background duties, while Capabilities decide what tools an avatar may invoke.

## Current Implementation Map

- Derived labels and rows: `src/services/avatarOperations.ts`
- Monitor registry and required/optional duties: `src/services/monitors/registry.ts`
- Tool ids and grouped tool ownership: `src/services/agenticTools/registry.ts`
- Tag helpers: `src/services/avatarTags/index.ts`
- Avatar data fields: `src/types/index.ts` (`Avatar.systemTags`, `Avatar.allowedAgenticToolIds`)
- Default steward avatars: `src/data/defaultAvatars.ts`
- Avatar Rules-tab summaries: `src/app/PrimaryAvatarSidebar.tsx`
- Avatar Builder read-only operational roles: `src/components/AvatarBuilderModal.tsx`
- Workshop hub tab: `src/components/WorkshopsPanel.tsx`
- Stewardship management surface: `src/components/StewardshipWorkshopPanel.tsx`
- Workshop tab state: `src/app/useAppContentModel.ts`
- Styling: `src/App.css`

## Execution Model

### Stewardships

1. A monitor is registered with a stable `name`, `required` flag, trigger list, description, and `run` handler.
2. An avatar claims it by carrying `monitor:<name>` in `systemTags`.
3. `pollAll()` looks up claimants by tag:
   - zero claimants plus `required: true` -> unclaimed warning path
   - multiple claimants -> duplicate warning path, first claimant runs
   - one claimant -> monitor runs with `ownerAvatarId`
4. `runMonitorsAndPost()` converts monitor posts into synthetic chat messages.
5. `contractLog()` may still write internal categories such as `contract:source_runner:email__runner_tick`; do not expose this wording as product UI unless debugging internals.

### Capabilities

1. Stable tool ids live in `AGENTIC_TOOL_IDS`.
2. Group-owned tools live in `TOOL_GROUPS`.
3. Group-owned tools require `tool_owner:<group>` in `Avatar.systemTags`, regardless of `allowedAgenticToolIds`.
4. Non-group tools are controlled by `allowedAgenticToolIds`:
   - `undefined`: default general access to registered non-group tools
   - `[]`: no JSON agentic tools
   - non-empty array: only listed tools are allowed
5. Prompt/tool protocol text is rendered from these permissions, and execution rechecks permissions before applying tool effects.

## UI Rules

- In avatar details, show Stewardships and Capabilities under the existing **Rules** tab.
- In Avatar Builder, show operational roles read-only. Do not expose freeform `systemTags` editing there.
- Use **Workshops → Stewardship** as the structured management surface for reassignment and allowlist changes.
- Stewardship and Capability owner rows use a two-step assignment control: choose an avatar, then click **Assign** or **Apply**. This keeps unassigned duties assignable and makes reassignment explicit.
- Individual Tool Allowlists are grouped by mode:
  - **The Privileged**: avatars with custom `allowedAgenticToolIds`.
  - **The Chorus**: avatars with `allowedAgenticToolIds === undefined`, meaning Default general tools.
  - **The Workers**: avatars with `allowedAgenticToolIds: []`, meaning no JSON agentic tools.
- **Default general tools** means registered non-group tools only. Grouped tools still require the matching `tool_owner:<group>` Capability owner.
- Display labels such as “Email source runner” and “Draft write tools”; avoid raw `monitor:*`, `tool_owner:*`, and tool ids except in developer diagnostics or secondary hints.

## Change Workflow

When changing this area:

1. Start with `src/services/avatarOperations.ts` so labels and row derivation stay centralized.
2. If adding a new Stewardship, register the monitor and add a friendly label in `avatarOperations.ts`.
3. If adding a new Capability group, update `TOOL_GROUPS`, user-facing labels, permission tests, and tool-protocol docs.
4. Keep assignment mutations structured:
   - Stewardship reassignment removes the matching `monitor:<name>` tag from old claimants and adds it to one selected avatar.
   - Capability owner reassignment removes/adds the matching `tool_owner:<group>` tag.
   - Individual tools update `allowedAgenticToolIds` explicitly.
   - For UI controls, preserve the chooser-plus-Apply pattern for owner reassignment so selecting an avatar does not silently mutate state.
5. Preserve built-in metadata safety: ordinary avatar edits must not accidentally strip or forge system tags.
6. After substantive changes, run `npm run verify` and smoke these surfaces: avatar Rules tab, edit-mode Avatar Builder, and Workshops → Stewardship.

## Tests And Docs

- Resolver/label tests belong near `src/services/avatarOperations.test.ts`.
- Permission behavior should also be covered near `src/services/agenticTools/registry.test.ts` when changing tool gates.
- Update `docs/WORKSHOPS.md` for user-facing workflow changes.
- Update `docs/AGENTIC_TOOLS.md` when changing tool ids, tool groups, or allowlist semantics.
