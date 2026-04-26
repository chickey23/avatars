# Workshops hub

Non-normative. Does not override [SPEC.md](../SPEC.md).

The **Workshops** surface (header checkbox) replaces the older single **Tool Workshop** column. It has six sub-tabs:

| Tab | Purpose |
|-----|---------|
| **Tool** | Tool telemetry aggregates and event log, refiner, proposals, and active addenda (same capabilities as [TOOL_WORKSHOP.md](./TOOL_WORKSHOP.md)). |
| **Unmet Needs** | Persisted queue of capability gaps (`localStorage` key `avatars_unmet_needs_v1`). See [UNMET_NEEDS.md](./UNMET_NEEDS.md). |
| **Source** | Filter unmet needs for **new_source** remediation and copy a **Cursor handoff** markdown block for out-of-app work. See [SOURCE_WORKSHOP.md](./SOURCE_WORKSHOP.md). |
| **Projects** | World metadata **projects** list (add, focus, remove, context-depth slider). Moved from the Context panel. |
| **Creation** | Well of Souls and internet-assisted avatar creation flow. |
| **Stewardship** | Assign avatar-held operational **Stewardships** and tool **Capabilities** without editing raw system tags. |

## Stewardship and capabilities

User-facing terminology separates two concepts that used to share internal “contract” language:

- **Stewardships** are monitor duties claimed by `monitor:*` tags, such as source runners, due/snoozed scheduler, and unassigned project watcher.
- **Capabilities** are tool permissions, including grouped `tool_owner:*` grants and per-avatar `allowedAgenticToolIds` allowlists.

The avatar details **Rules** tab and edit-mode avatar builder show read-only summaries. **Workshops → Stewardship** is the structured management surface for reassigning owners and changing individual tool allowlist mode.

Stewardship and Capability owner tables use explicit reassignment controls: choose an avatar, then click **Assign** for unclaimed rows or **Apply** for existing owners. Reassignment removes the matching ownership tag from previous claimants and adds it to the selected avatar.

Individual Tool Allowlists are grouped by mode:

- **The Privileged** — avatars with custom `allowedAgenticToolIds`; each tool can be toggled.
- **The Chorus** — avatars using **Default general tools** (`allowedAgenticToolIds` omitted). This includes registered non-group tools; grouped tools still require the matching Capability owner above.
- **The Workers** — avatars with **No JSON tools** (`allowedAgenticToolIds: []`).

## Telemetry previews

Successful tool calls may store a short **`resultPreview`** on each telemetry event (derived from worldview activity action summaries). For **`world_metadata.patch_projects`**, the summary includes **human titles** from the patch payload when present (see [`patchProjectsSummary.ts`](../src/services/worldviewTools/patchProjectsSummary.ts)), not only opaque ids—this feeds better **Unmet Needs** title suggestions and aggregate **Preview** text.

Aggregate rows show **`lastResultPreview`**: the preview from the **newest** event in that bucket (successes use `resultPreview`; failures fall back to `argsPreview`).

## Escalation

From **Tool → Event log**, use **Add to Unmet Needs** on a row to open a short form: **title** (prefilled from telemetry when possible, including project titles for `world_metadata.patch_projects`), optional **related project** dropdown, and the user message excerpt when known. Submitted items include telemetry ids and suggested remediation track.

The last selected sub-tab is remembered in `sessionStorage` (`avatars_workshop_subtab`).

## Chat Visualizer (user turns)

When **Chat Visualizer** is enabled, **user** queue nodes resolve the matching **user message text** from the live chat thread and show a **short caption** under the tick (plus tooltip / `aria-label` with a longer excerpt). Nothing is duplicated into the waves queue on disk; previews are read-only at render time.
