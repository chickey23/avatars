# Context scoring system (overview)

This document is the **conceptual home** for how the Avatar Interface turns raw connector data into **structured, bounded relevance** for LLM prompts. Per-source details: [email](CONTEXT_SCORING_EMAIL.md), [calendar](CONTEXT_SCORING_CALENDAR.md), [contacts](CONTEXT_SCORING_CONTACTS.md). A deterministic **preprocessor** adjusts per-source caps before scoring ([WORLD_MODEL_AND_PREPROCESSOR.md](WORLD_MODEL_AND_PREPROCESSOR.md)).

---

## Why scoring exists

Connectors (email, calendar, contacts, …) can supply more information than belongs in a single prompt. **Context scoring** ranks items against the current **situation**—what the user and avatars have been discussing, what the user marked as important, and optional task hints—so each turn carries a **growing, selective picture** instead of an unbounded dump.

---

## Design goals

1. **Bounded prompts** — Fixed top-**K** lists per scored source (email, calendar, and contacts each have their own K and formatter).
2. **Transparency** — Rank and normalized score appear in line text so traces and “full prompt” debugging stay interpretable.
3. **Explicit user intent** — Focus selections in the UI (email, calendar, contact) map to **large deterministic bonuses** so chosen items surface first when they appear in the connector snapshot.
4. **Expandability** — New data sources should follow the same pattern: **fetch → score vs situation → format lines → merge into `relevantData`** (or a dedicated proactive path). Mechanics may evolve (better retrieval, embeddings, shared metadata); the **seams** stay: connectors, scoring layer, Situation Context, avatar agents.

**User-pinned web lines** (`userInternetContextLines` on `SituationContext`) are **not** connector-scored: the user selects search hits in **Context → Internet**, and those formatted strings are appended to `relevantData` each turn verbatim (see [TARGETED_SEARCH.md](./TARGETED_SEARCH.md)).

---

## Glossary

| Term | Meaning |
|------|--------|
| **Situation Context** | The structured state passed through the app: thread, recent events, `relevantData`, focus, optional WoS rules (`wellOfSoulsRules` merged when non-empty), proactive fields, etc. See types in `src/types`. |
| **User turn** | One user message that triggers `processUserTurn`: gather data, merge proactive hints, build `relevantData`, run the switchboard / avatars. |
| **Corpus** | Lowercase text from the last **N** conversation messages, optional `activeTask`, optional **focus-derived appendix** (focused email subject/snippet/body excerpt, focused calendar title/location/time), and optional **world-metadata scoring corpus** (user profile, focused project text, capped people overlays)—used for **keyword overlap** with connector items. |
| **Focus** | User-selected context (`SituationFocus`): pointers to an email, calendar event, or contact. Drives **id-match bonuses**, the focus appendix above, and **soft bonuses** (shared tokens / venue-ish overlap, same-day mail vs focused email date, calendar time-window proximity). |
| **Top-K** | Maximum number of scored lines injected per source per turn (e.g. `EMAIL_CONTEXT_TOP_K`, `CALENDAR_CONTEXT_TOP_K`, `CONTACT_CONTEXT_TOP_K`). |
| **World metadata** | Versioned local JSON holding per-person fields (tags, relationship note, notes), projects, and user profile. Drives contact **overlay** blobs and a **capped scoring corpus** for email/calendar/contacts; see [World metadata (JSON)](#world-metadata-json-v1) below. |
| **Displayed score (`score` on each line)** | **Focus-relative 0–100** (`normFocus`): when a row matches **focus id** for that source, it shows **100**; other rows normalize against the **max base score among non–focus-id rows** in the same top-**K** batch so related items (e.g. same venue) are not all rounded to **0**. A legacy batch norm is still computed internally as `normScore` for diagnostics. |
| **`relevantData`** | `string[]` in `SituationContext`: primary channel for connector-derived and rules text that avatars receive as “what’s relevant right now.” |
| **Switchboard** | Logic that chooses which avatars speak and in what order; uses the situation and tags; works **with** `relevantData` rather than replacing scoring. |
| **Connector** | Module that reads external or mock data (OAuth, APIs) into typed items (`EmailItem`, `CalendarEvent`, …). |
| **Proactive pipeline** | Separate path that evaluates **new** items (e.g. email) for pending notifications; may reuse scoring primitives with different aggregation rules. |

---

## Proactive email notifications (affinity gating)

New mail is scored once per email with the same **base** relevance as user-turn email scoring (`scoreEmailItems`: corpus overlap plus focus-id bonus). Each avatar adds a **tag/interest bonus** from subject + snippet substring matches (capped). **Combined score** drives urgency (low / medium / high).

To avoid several avatars notifying on the **same** email when they only share the generic base (no individualized match on the message):

- **`PROACTIVE_MIN_COMBINED_SCORE`** (default 45) — offers below this are dropped before capping.
- **`PROACTIVE_MIN_AFFINITY_BONUS`** (default 5) — when the user has **not** focused that email, only the **highest** combined scorer is kept unless another avatar in the sorted list has at least this much tag/interest bonus (e.g. one interest or tag hit). Up to **`PROACTIVE_MAX_AVATARS_PER_CLUSTER`** (3) may still enqueue when multiple avatars earn that bonus.
- When the **focused** email matches this message, the extra-affinity rule is **not** applied so explicit user intent can still surface multiple avatars.

Implementation: [`src/services/pendingNotifications.ts`](../src/services/pendingNotifications.ts) — `filterProactiveAvatarOffers`, `scoreAvatarsForNewEmail`.

**UI tuning:** The left sidebar **Behavior** panel adjusts proactive thresholds (and a context-vs-character slider) via `SituationContext.behaviorTuning`, persisted with the rest of situation context. Resolved defaults and formatting for Ollama and rules/fallback replies live in [`src/services/behaviorTuningFormat.ts`](../src/services/behaviorTuningFormat.ts). The right **You right now** block sets engagement and optional mood text on the same object.

---

## World model and avatars

**World model (application view).** The application’s understanding of the user’s world is **not** a single hidden tensor—it is the **accumulated, structured state** we maintain and surface: conversation thread, turn archive, connector snapshots after scoring, focus, proactive queues, and (over time) shared metadata and richer summaries. **Scoring is one of the main ways that model is *focused* and *refreshed* each turn:** it decides which external facts are **salient** given the latest dialogue and UI focus.

That model is meant to **deepen over time** as we add sources, metadata, and better summarization. It is also meant to remain **accessible to avatars** in the same sense as today: if something matters for behavior, it should flow through explicit fields (e.g. `relevantData`, situation strings, rules) that the prompt builder can rely on, rather than only living in opaque side channels.

**Avatar evolution.** Avatars are expected to **change with long-running interaction**. Today, “evolution” is realized **practically** by **what we put in prompts** (situation text, rules, affinity, future profile fields): the Ollama path receives **updated structured content** each turn. Later, persistent avatar state, tools, or fine-tuning could extend that; the design intent is continuity of **persona + memory + access to the same growing world model**.

**System self-knowledge.** We intend the world model to eventually include **knowledge of the application itself**—connectors, scoring, switchboard, UI affordances—so avatars can reason about *how* they receive information and what the user can do. That layer is not fully implemented yet; scoring docs and [TECHSPEC.md](../TECHSPEC.md) are early anchors for where that knowledge will attach (e.g. documented behavior, future `data/metadata/` or agent-readable system summaries).

---

## World metadata (JSON v1)

**Local-only** accumulated facts about **people** (keyed by Google contact id) live in a small document separate from `SituationContext`:

- **Module:** [`src/services/worldMetadata/`](../src/services/worldMetadata/) — types, `WorldMetadataBackend`, `LocalStorageWorldMetadataBackend`, in-memory store.
- **Storage v1:** `localStorage` key `avatars_world_metadata_v1` (full-document **replace** on each debounced write).
- **API:** `ensureWorldMetadataLoaded`, `getWorldMetadata`, `patchWorldMetadata`, `schedulePersistWorldMetadata` (debounced ~120ms so the UI thread does not block), `getContactOverlayById` for scoring.
- **Schema:** `schemaVersion: 1`, `people: Record<id, { userTags?, relationshipNote?, notes?, updatedAt }>`.

**Migration path:** When JSON grows large or queries are needed, implement a new backend (Tauri **file** under app data, or **SQLite**) behind `WorldMetadataBackend`, optionally one-time import from `localStorage`. **Dedicated device:** `localStorage` is per browser profile; moving to a dedicated machine favors a **file** or **DB** path under the app’s data directory plus export/import if needed.

There is **no chat UI** for editing metadata in this phase; `patchWorldMetadata` is available for future UI or tooling.

**Scoring corpus helper:** [`src/services/worldMetadata/scoringCorpus.ts`](../src/services/worldMetadata/scoringCorpus.ts) — `buildWorldMetadataScoringCorpus` (capped length, optional focused project).

---

## Social solo heuristic

When **no contact is focused** and every contact in the scored top-**K** has **raw score 0** (no overlap with corpus), `processUserTurn` appends one line to `relevantData` (`SOCIAL_SOLO_HEURISTIC_LINE` in [`contacts.ts`](../src/services/contextScoring/contacts.ts)) so avatars can treat the situation as possibly unstated companions / solo context without inventing people.

---

## Related documents

- [CONTEXT_SCORING_EMAIL.md](CONTEXT_SCORING_EMAIL.md) — Email scoring implementation details.  
- [CONTEXT_SCORING_CALENDAR.md](CONTEXT_SCORING_CALENDAR.md) — Calendar scoring implementation details.  
- [CONTEXT_SCORING_CONTACTS.md](CONTEXT_SCORING_CONTACTS.md) — Contact scoring implementation details.  
- [SPEC.md](../SPEC.md), [PROGRESS.md](../PROGRESS.md) — Product status and spec alignment.  
- [STYLEGUIDE.md](STYLEGUIDE.md) — Terminology and naming.
