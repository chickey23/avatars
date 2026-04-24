# Unmet Needs

Non-normative.

**Unmet Needs** are persisted items describing unsatisfied user intent or capability gaps. They are **not** platform tasks in [`src/services/platform/store.ts`](../src/services/platform/store.ts) unless you wire that separately.

- **Storage:** `avatars_unmet_needs_v1` in `localStorage` (see `src/services/unmetNeeds/`).
- **Fields:** title, status, remediation track (`new_source` | `new_tool` | `prompt_only` | `investigate`), optional user prompt excerpt, optional `userMessageId`, optional **`relatedProjectId`** (world metadata project id), notes, linked telemetry event ids.
- **Related project in the UI:** chosen from a **dropdown** of current world-metadata projects (**Workshops → Projects**). If a stored id no longer exists, the row can still show it as “missing from list” until you clear or change it.
- **Create:** **Workshops → Tool → Event log → Add to Unmet Needs** (modal: title prefilled when telemetry supports it—e.g. first project title from `patch_projects`—plus optional related project and excerpt), or add future entry points.

Full hub overview: [WORKSHOPS.md](./WORKSHOPS.md).
