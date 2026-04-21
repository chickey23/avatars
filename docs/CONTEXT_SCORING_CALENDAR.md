# Calendar context scoring

This document describes how **upcoming calendar events** from connectors are ranked and summarized for each **user turn** before they reach avatars via `SituationContext.relevantData`.

## Purpose

Like email, the calendar connector can return many events within the configured horizon. Calendar scoring keeps a **bounded, relevance-ordered** list (top **K**) so prompts emphasize events that match the conversation, active task, **focused** mail/calendar (shared corpus + soft signals), and world metadata snippets.

## Where it lives

| Piece | Location |
|--------|----------|
| Scoring + formatting | [`src/services/contextScoring/calendar.ts`](../src/services/contextScoring/calendar.ts) |
| Focus appendix + soft signals | [`src/services/contextScoring/focusRelevance.ts`](../src/services/contextScoring/focusRelevance.ts) |
| Focus-relative display norms | [`src/services/contextScoring/normFocus.ts`](../src/services/contextScoring/normFocus.ts) |
| Wired into each user turn | [`processUserTurn` in `src/store/appStore.ts`](../src/store/appStore.ts) |
| Unit tests | [`src/services/contextScoring/calendar.test.ts`](../src/services/contextScoring/calendar.test.ts) |

## Inputs

- **Events:** `CalendarEvent[]` from `gatherDataFromSources()` (`fetchCalendarUpcoming`, with mock fallback).
- **Context (`CalendarScoringContext`):**
  - **`conversationThread`** — last **N** messages (default **15**) feed the keyword corpus.
  - **`activeTask`** — optional string in the corpus.
  - **`focus.calendar`** — if the user focused an event, that event’s **id** receives a large score bonus.
  - **`focusCorpusAppendix`**, **`worldMetadataCorpus`**, **`focusSoft`** — same pattern as email (built in `processUserTurn` from focus rows + optional focused email body excerpt so **email focus** still boosts calendar lines at the same venue/time).

## Scoring mechanics (summary)

1. Build the **corpus** (active task + thread tail + focus appendix + world-metadata scoring corpus).
2. For each event, build a **blob** from **title**, **location** (if any), and a fixed **English** start-time string from `start` (`formatEventStart`, `en-US` locale for consistency).
3. **Tokenize** the blob and compute **overlap** with the corpus (same caps as email scoring).
4. Add a **focus-id bonus** when `focus.calendar.id` matches the event’s `id`.
5. Add **soft bonuses**: token overlap with `focusSoft` (e.g. location from focused calendar or rich tokens from a focused confirmation email), and **time-window** proximity when the user focused a calendar event (overlap / nearby window).
6. Sort by **score descending**, tie-break by **sooner `start`** (earlier upcoming events first when scores tie).
7. Take the top **K** (default **5**, `CALENDAR_CONTEXT_TOP_K`).
8. **Displayed `score`** uses **focus-relative** `normFocus` (same rules as email; see [CONTEXT_SCORING.md](CONTEXT_SCORING.md)).

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
