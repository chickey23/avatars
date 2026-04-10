# Contact context scoring

This document describes how **contacts** from connectors are ranked and summarized for each **user turn** before they reach avatars via `SituationContext.relevantData`.

## Purpose

The contacts connector can return many people. Contact scoring keeps a **bounded, relevance-ordered** list (top **K**) so prompts emphasize contacts that match the conversation, active task, user **focus**, and optional **local metadata** (tags, notes) stored in world metadata.

## Where it lives

| Piece | Location |
|--------|----------|
| Scoring + formatting | [`src/services/contextScoring/contacts.ts`](../src/services/contextScoring/contacts.ts) |
| Wired into each user turn | [`processUserTurn` in `src/store/appStore.ts`](../src/store/appStore.ts) |
| World metadata (overlay text) | [`src/services/worldMetadata/store.ts`](../src/services/worldMetadata/store.ts) (`getContactOverlayById`) |
| Unit tests | [`src/services/contextScoring/contacts.test.ts`](../src/services/contextScoring/contacts.test.ts) |

## Inputs

- **Contacts:** `Contact[]` from `gatherDataFromSources()` (`fetchContacts`, with mock fallback).
- **Context (`ContactScoringContext`):**
  - **`conversationThread`** — last **N** messages (default **15**) feed the keyword corpus.
  - **`activeTask`** — optional string in the corpus.
  - **`focus.contact`** — if the user focused a contact, that person’s **id** receives a large score bonus.
  - **`contactOverlayById`** — optional map of contact id → extra text (from [world metadata](CONTEXT_SCORING.md#world-metadata-json-v1)) merged into the **overlap blob** only (not repeated as separate `relevantData` lines).

## Scoring mechanics (summary)

1. Build the same style of **corpus** as email/calendar (active task + thread tail).
2. For each contact, build a **blob** from **name**, **email**, **birthday**, plus overlay text when present.
3. **Tokenize** the blob and compute **overlap** with the corpus (same caps as email scoring).
4. Add a **focus-id bonus** when `focus.contact.id` matches the contact’s `id`.
5. Sort by **score descending**, tie-break by **name** (locale-aware).
6. Take the top **K** (default **5**, `CONTACT_CONTEXT_TOP_K`).
7. **Normalize** displayed scores to 0–100 within the batch.

## Output format

Each selected contact becomes one line, for example:

```text
contact [rank 1, score 100]: Jane Doe — jane@example.com (birthday: 04-12)
```

Email and birthday segments are omitted when absent.

## Relationship to other strings

Contacts are **not** included in the generic `contact: …` dump from `dataToRelevanceStringsWithoutEmail`; only these scored lines inject contacts into `relevantData` for user turns. See [`connectors/index.ts`](../src/connectors/index.ts).

## Future work

Proactive notifications may eventually score **new or updated** contacts per avatar. Relationship **edges** and richer graph fields may live in world metadata or a future store.
