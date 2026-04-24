# Tool Workshop

Non-normative. Does not override [SPEC.md](../SPEC.md).

## UI placement

The refiner, telemetry tables, and addenda UI live under **Workshops → Tool** (header **Workshops** checkbox). See [WORKSHOPS.md](./WORKSHOPS.md) for the full hub (**Unmet Needs**, **Source**, **Projects**). Successful telemetry rows may include a short **`resultPreview`** (human-readable outcome); aggregate **Overview** shows **Preview** (`lastResultPreview`, newest event in the bucket). For **`world_metadata.patch_projects`**, previews emphasize **project titles** from the executed patch when available.

### Unmet Needs escalation (Event log)

**Add to Unmet Needs** opens an in-app form (not a browser prompt): editable **title** (prefilled from telemetry via [`telemetryHints`](../src/services/unmetNeeds/telemetryHints.ts)), optional **related project** dropdown (same list as **Workshops → Projects**), optional **user message** snippet when the event has a `userMessageId`, then **Add** / **Cancel**.

## Purpose

The **Tool Workshop** closes the loop between **tool execution outcomes** and **what the model reads** on the next turn:

1. **Telemetry** — Each Ollama avatar turn records successes and failures (including parse/lexical issues) in `localStorage` (`avatars_tool_telemetry_v1`). Success events may store **`resultPreview`** (from worldview activity action summaries; `patch_projects` rows include titles where the tool args supplied them). When the turn had a detected user intent ([`turnToolIntent.ts`](../src/services/turnToolIntent.ts)), success rows may also store **`turnIntent`** and **`correctToolForIntent`** for quality rollups.
2. **Refiner** — Optional Ollama job proposes short, category-tagged **addendum** items (JSON contract). Proposals are **never** applied automatically.
3. **Approval** — The user approves items in the workshop UI; active addenda are appended **inside the Tool protocol section** of the Ollama prompt: [`runAvatarAgent`](../src/services/avatarAgents.ts) builds the profile block via [`renderToolProtocol`](../src/services/agenticTools/toolProtocol.ts) and [`buildWorldviewToolsPrompt`](../src/services/avatarAgents.ts), then [`renderWorkshopGuidanceForPrompt`](../src/services/toolWorkshop/render.ts) appends user-approved lines after that static block (still under **Tool protocol**).
4. **Auto refiner** — When enabled in the workshop, [`AppProvider`](../src/context/AppProvider.tsx) may run the refiner on an interval and/or when failure counts exceed a delta (Ollama must be ready).

**Overview tab:** Besides permission-sorted aggregate rows, the UI shows **Intent match** (global) and **Intent match by avatar** when telemetry includes intent-labeled successes (see **Telemetry** in [AGENTIC_TOOLS.md](./AGENTIC_TOOLS.md)).

## Human-readable refiner prompts

Bundled defaults live in [`refinerPrompts.ts`](../src/services/toolWorkshop/refinerPrompts.ts) (`REFINER_SYSTEM_DEFAULT`, user payload builder). The workshop **Refiner** tab allows a full **system prompt override** (stored in the workshop doc).

## Settings defaults

| Setting | Default |
|--------|---------|
| Max active addenda | 8 |
| Max chars per addendum item | 400 |
| Auto refiner interval | 24 h (0 = off for interval arm) |
| Failure delta threshold | 5 (0 = off) |
| Auto refiner enabled | false |

## Storage keys

| Key | Content |
|-----|---------|
| `avatars_tool_telemetry_v1` | Event ring buffer + schema version |
| `avatars_tool_workshop_v1` | Settings, active addenda, pending proposals, refiner overrides, refiner timestamps |

## Permission errors in UI

Overview and event lists **sort permission-related failures first** and use a distinct **denied** marker for `permission_denied` / `permission_denied_projects`.

## Related docs

- [AGENTIC_TOOLS.md](./AGENTIC_TOOLS.md) — tool ids and permissions.
- [STYLEGUIDE.md](./STYLEGUIDE.md) — Session log: `tool_workshop` category.
