# Switchboard visualization

**Non-normative.** This note does not override [SPEC.md](../SPEC.md). Layout and visual choices follow **SPEC § Behavioral Instructions** (consult the user on major changes).

## Metaphor

The **Waves** column (optional toolbar checkbox) is a **persistent queue log** and state tracker for the current **visible chat session**:

- **User turns** appear as a **horizontal bar** entry.
- **Routing waves** appear as **colored dots** per responder (one row per trace step). Dot colors use each avatar’s **`appearance.accentColor`** from the catalog (same source as message portraits).
- **Worldview** rows: **◆** when structured tools ran successfully (`onWorldviewActivity`). **!** (orange) when the model’s reply **looked like** worldview tools but did **not** parse as `avatars_tools_v1` (`onWorldviewParseDiagnostic` → `parseStatus: warn`, summary `parse: malformed`); tooltip carries heuristic detail. See [`worldviewTools/diagnose.ts`](../src/services/worldviewTools/diagnose.ts) and [TEST_PLAN.md](TEST_PLAN.md).
- **Monitor** rows: **?** when a [`monitor_prompt`](../src/services/switchboardWavesQueue/types.ts) entry is enqueued for a synthetic monitor message ([`postSynthetic.ts`](../src/services/monitors/postSynthetic.ts)) — non-blocking prompts (e.g. unassigned projects, contract warnings); chat bubbles carry a monitor tag and optional inline actions.
- The queue **persists across app reloads** (`localStorage` key `avatars_switchboard_waves_queue_v1`) so development reloads do not wipe it. It **resets on Clear chat** (with a session-log line); forensic detail is not duplicated here—use **turn archive** and **session log** for audit trails.
- **Motion tiers**: wide viewports use a **rise-into-slot** animation whose duration defaults to **~4s** (tunable via **`SWITCHBOARD_WAVE_TRAVEL_MS`** in [`src/services/switchboardWavesQueue/constants.ts`](../src/services/switchboardWavesQueue/constants.ts)); mid-width viewports **blink at bottom** then settle; **very narrow** viewports **hide** the column. **`prefers-reduced-motion`** disables long travel and blink loops.
- When the list exceeds **~33%** of the column height, the list **auto-scrolls** as entries are added.

## Settlement and blink

Each **wave** row is **`settled: false`** when created from `onTraceProgress`. **Pending blink** (on the responder dots) stops for that row when **`onWaveChatComplete`** runs in [`distributeAndRespond()`](../src/services/switchboard.ts)—i.e. after **all** avatars for that **cascade depth** have finished and their messages are on the thread, **before** the next routing wave. [`markWaveSettledForUserDepth()`](../src/services/switchboardWavesQueue/operations.ts) matches by **`userMessageId`** and trace **`depth`**.

When the turn ends (or on error cleanup), [`markWavesSettledForUser()`](../src/services/switchboardWavesQueue/operations.ts) in **`finally`** in [`AppContext.tsx`](../src/context/AppContext.tsx) sets any remaining wave rows for that user message to settled (safety net).

## Mapping to code

- **Queue model**: [`src/services/switchboardWavesQueue/`](../src/services/switchboardWavesQueue/) — append on user send and `onTraceProgress`; per-wave settle via `onWaveChatComplete` → `markWaveSettledForUserDepth`; turn-level cleanup in `finally`; reset on `clearChat` in [`AppContext.tsx`](../src/context/AppContext.tsx).
- **Switchboard**: [`distributeAndRespond()`](../src/services/switchboard.ts) — `onTraceProgress`, **`onWaveChatComplete`**, `onAvatarComplete`.
- **UI**: [`SwitchboardViz.tsx`](../src/components/SwitchboardViz.tsx).
- **Chat**: Hover shows a **one-line** routing/source line on each message; click (outside nested controls) **scrolls** the message into view and **expands** the Ollama / rules prompt panel when present ([`App.tsx`](../src/App.tsx)).

## Sounds

Optional audio cues are **not implemented**; if added later, keep them secondary to text and offer user control.

## Status

**Implemented** — persistent queue, motion tiers, chat hover/click, accent-colored dots, per-wave settlement. Iteration may refine animation curves and reconciliation with the thread after failures.

---

## Storage visualizer (right column)

A **second** optional column sits **to the right of the chat transcript** (toolbar checkbox **Storage viz**). It does **not** duplicate routing waves; it surfaces **local caches**, **scoring diagnostics**, and **audit snippets**.

### UI

- **Component:** [`SourceCacheViz.tsx`](../src/components/SourceCacheViz.tsx); layout and styles in [`App.tsx`](../src/App.tsx) / [`App.css`](../src/App.css) (`.source-cache-viz-column`, `.source-cache-viz-*`).
- **Details panel:** **Hover** opens a floating panel to the **left** of the narrow strip; **click** the same chip **pins** the panel (click outside or **Escape** to close). Sections are **typed headings** with bullet lists (Gmail insight cache, inbox ranking, world metadata, worldview audit tail, waves persist key, **Background** monitor contracts + session-log tail filtered for `contract:` and `platform_*` log lines from the platform module (`PLATFORM_LOG_CATEGORY` in [`../src/services/platform/constants.ts`](../src/services/platform/constants.ts)), planned sources).
- **Persistence:** Checkbox `avatars_source_cache_viz_enabled`; width `avatars_source_cache_viz_width_px`. Same min/max width constants as the Chat Visualizer column.
- **Viewport:** Uses the same **hide when very narrow** gate as the Waves column (`WAVES_COLUMN_HIDE_MAX_WIDTH_PX`).

### Evaluation glossary (inbox)

| Concept | Meaning |
|--------|---------|
| **In prompt (top-K)** | Lines like `email [id …, rank …, score …]` in `relevantData` for the last user turn — same selection as [`rankEmailsForContext`](../src/services/contextScoring/email.ts). |
| **Scored, not in prompt** | Rows in `lastEmailRankingDiagnostics.belowTopK` — entire fetched batch was scored; these ids did not fit top-K. `normFocus` there is computed over the **full** batch for display (see [`rankEmailsForContextWithDiagnostics`](../src/services/contextScoring/email.ts)). |
| **Insight cache relevance** | Per-message LLM prep in [`emailInsights/store.ts`](../src/services/emailInsights/store.ts): `relevant` / `irrelevant` / `uncertain` — independent of inbox rank lines. |
| **Focus prep (user row)** | [`EmailFocusArtifacts`](../src/types/index.ts) on the user message — cache hit/miss + relevance; also shown as chips in the transcript. |

### Caching roadmap (pre-Ollama digest)

Future work: cache a **stable digest** of focus + ranked email ids + normFocus (or hashed `relevantData` slice) **before** avatar Ollama calls, keyed by `(focusFingerprint, connectorSnapshotKey)`; invalidate on focus change, new Gmail fetch, or email-insight TTL expiry. Not persisted yet; the Storage viz is the **observability** layer for validating what would be cached.

### Planned connectors (UI stubs)

Reddit, Hotmail/Outlook, YouTube (now playing / recent), Steam — listed under **Soon** with “not connected”. Implementation order: connector in [`connectors/`](../src/connectors/) → scoring module (pattern of `contextScoring/email.ts`) → optional insight store → new chip on this column.

See also **[HANDOFF_TOMORROW.md](../HANDOFF_TOMORROW.md)** verification row for Storage viz.
