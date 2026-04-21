# Contact context scoring

This document describes how **contacts** from connectors are ranked and summarized for each **user turn** before they reach avatars via `SituationContext.relevantData`.

## Purpose

The contacts connector can return many people. Contact scoring keeps a **bounded, relevance-ordered** list (top **K**) so prompts emphasize contacts that match the conversation, active task, user **focus**, optional **local metadata** (tags, notes) stored in world metadata, and the same **focus appendix + world-metadata corpus** used for email/calendar.

## Where it lives

| Piece | Location |
|--------|----------|
| Scoring + formatting | [`src/services/contextScoring/contacts.ts`](../src/services/contextScoring/contacts.ts) |
| Solo heuristic | `shouldInjectSocialSoloHint`, `SOCIAL_SOLO_HEURISTIC_LINE` in the same module |
| Wired into each user turn | [`processUserTurn` in `src/store/appStore.ts`](../src/store/appStore.ts) |
| World metadata (overlay text) | [`src/services/worldMetadata/store.ts`](../src/services/worldMetadata/store.ts) (`getContactOverlayById`) |
| World metadata (scoring corpus) | [`src/services/worldMetadata/scoringCorpus.ts`](../src/services/worldMetadata/scoringCorpus.ts) |
| Unit tests | [`src/services/contextScoring/contacts.test.ts`](../src/services/contextScoring/contacts.test.ts) |

## Inputs

- **Contacts:** `Contact[]` from `gatherDataFromSources()` (`fetchContacts`, with mock fallback).
- **Context (`ContactScoringContext`):**
  - **`conversationThread`** — last **N** messages (default **15**) feed the keyword corpus.
  - **`activeTask`** — optional string in the corpus.
  - **`focus.contact`** — if the user focused a contact, that person’s **id** receives a large score bonus.
  - **`contactOverlayById`** — optional map of contact id → extra text (from [world metadata](CONTEXT_SCORING.md#world-metadata-json-v1)) merged into the **overlap blob** only (not repeated as separate `relevantData` lines).
  - **`focusCorpusAppendix`**, **`worldMetadataCorpus`** — same as email/calendar so names mentioned on a ticket or in profile text can lift matching contacts.

## Scoring mechanics (summary)

1. Build the **corpus** (active task + thread tail + focus appendix + world-metadata scoring corpus).
2. For each contact, build a **blob** from **name**, **email**, **birthday**, plus overlay text when present.
3. **Tokenize** the blob and compute **overlap** with the corpus (same caps as email scoring).
4. Add a **focus-id bonus** when `focus.contact.id` matches the contact’s `id`.
5. Sort by **score descending**, tie-break by **name** (locale-aware).
6. Take the top **K** (default **5**, `CONTACT_CONTEXT_TOP_K`).
7. **Displayed `score`** uses **focus-relative** `normFocus` (same rules as email; see [CONTEXT_SCORING.md](CONTEXT_SCORING.md)).

## Output format

Each selected contact becomes one line, for example:

```text
contact [rank 1, score 100]: Jane Doe — jane@example.com (birthday: 04-12)
```

Email and birthday segments are omitted when absent.

## Social solo heuristic

When **no contact is focused** and every contact in the scored top-**K** has **raw score 0**, `processUserTurn` appends `SOCIAL_SOLO_HEURISTIC_LINE` to `relevantData` so avatars can treat the turn as possibly solo or unstated companions without inventing attendees.

## Relationship to other strings

Contacts are **not** included in the generic `contact: …` dump from `dataToRelevanceStringsWithoutEmail`; only these scored lines inject contacts into `relevantData` for user turns. See [`connectors/index.ts`](../src/connectors/index.ts).

## Future work

Proactive notifications may eventually score **new or updated** contacts per avatar. Relationship **edges** and richer graph fields may live in world metadata or a future store.
