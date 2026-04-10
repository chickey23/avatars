# Calendar context scoring

This document describes how **upcoming calendar events** from connectors are ranked and summarized for each **user turn** before they reach avatars via `SituationContext.relevantData`.

## Purpose

Like email, the calendar connector can return many events within the configured horizon. Calendar scoring keeps a **bounded, relevance-ordered** list (top **K**) so prompts emphasize events that match the conversation, active task, and any **focused** event in the UI.

## Where it lives

| Piece | Location |
|--------|----------|
| Scoring + formatting | [`src/services/contextScoring/calendar.ts`](../src/services/contextScoring/calendar.ts) |
| Wired into each user turn | [`processUserTurn` in `src/store/appStore.ts`](../src/store/appStore.ts) |
| Unit tests | [`src/services/contextScoring/calendar.test.ts`](../src/services/contextScoring/calendar.test.ts) |

## Inputs

- **Events:** `CalendarEvent[]` from `gatherDataFromSources()` (`fetchCalendarUpcoming`, with mock fallback).
- **Context (`CalendarScoringContext`):**
  - **`conversationThread`** — last **N** messages (default **15**) feed the keyword corpus.
  - **`activeTask`** — optional string in the corpus.
  - **`focus.calendar`** — if the user focused an event, that event’s **id** receives a large score bonus.

## Scoring mechanics (summary)

1. Build the same style of **corpus** as email (active task + thread tail).
2. For each event, build a **blob** from **title**, **location** (if any), and a fixed **English** start-time string from `start` (`formatEventStart`, `en-US` locale for consistency).
3. **Tokenize** the blob and compute **overlap** with the corpus (same caps as email scoring).
4. Add a **focus-id bonus** when `focus.calendar.id` matches the event’s `id`.
5. Sort by **score descending**, tie-break by **sooner `start`** (earlier upcoming events first when scores tie).
6. Take the top **K** (default **5**, `CALENDAR_CONTEXT_TOP_K`).
7. **Normalize** displayed scores to 0–100 within the batch.

## Output format

Each selected event becomes one line, for example:

```text
calendar [rank 1, score 100]: Title — Location (Thu, Apr 10, 3:00 PM)
```

Location is omitted from the line when absent.

## Relationship to other strings

Calendar events are **not** included in the generic `calendar: …` dump from `dataToRelevanceStringsWithoutEmail`; only these scored lines inject calendar into `relevantData` for user turns. See [`connectors/index.ts`](../src/connectors/index.ts).

## Future work

Proactive notifications may eventually score **new or changed** calendar items per avatar (parallel to email in `pendingNotifications.ts`). That is not wired as of this document.
