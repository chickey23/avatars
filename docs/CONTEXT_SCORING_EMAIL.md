# Email context scoring

This document describes how **recent email** from connectors is ranked and summarized for each **user turn** before it reaches avatars via `SituationContext.relevantData`.

## Purpose

The app can fetch many recent messages. Sending all of them verbatim into every LLM prompt would be noisy, slow, and expensive. Email scoring selects a **small, relevance-ordered subset** (top **K**) so the model sees messages that align with the current conversation, task, and explicit user focus.

## Where it lives

| Piece | Location |
|--------|----------|
| Scoring + formatting | [`src/services/contextScoring/email.ts`](../src/services/contextScoring/email.ts) |
| Wired into each user turn | [`processUserTurn` in `src/store/appStore.ts`](../src/store/appStore.ts) |
| Unit tests | [`src/services/contextScoring/email.test.ts`](../src/services/contextScoring/email.test.ts) |

## Inputs

- **Emails:** `EmailItem[]` from `gatherDataFromSources()` (Gmail when connected, else mock).
- **Context (`EmailScoringContext`):**
  - **`conversationThread`** — last **N** messages (default **15**) contribute a **keyword corpus** (see [CONTEXT_SCORING.md](CONTEXT_SCORING.md)).
  - **`activeTask`** — optional string folded into the same corpus.
  - **`focus.email`** — if the user focused an email in the UI, that message’s **id** receives a large score bonus so it tends to rank first.

## Scoring mechanics (summary)

1. Build a lowercase **corpus** from `activeTask` and the tail of the conversation thread.
2. For each email, form a **blob** from `from`, `subject`, and `snippet`.
3. **Tokenize** the blob (words of length ≥ 3, alphanumeric-ish), count how many tokens **appear as substrings** in the corpus (capped per email).
4. Add a **focus-id bonus** when `focus.email.id` matches the email’s `id`.
5. Sort by **score descending**, tie-break by **newer `date`**.
6. Take the top **K** (default **5**, `EMAIL_CONTEXT_TOP_K`).
7. **Normalize** displayed scores to 0–100 relative to the **maximum score in this batch** (so the top line often shows **100** when it is the clear winner).

## Output format

Each selected email becomes one line in `relevantData`, for example:

```text
email [rank 1, score 100]: Subject — snippet… (from user@example.com)
```

The rank and normalized score are **diagnostic** for debugging and transparency; the LLM still receives natural language content.

## Relationship to other strings

`relevantData` also includes focus strings, optional Well of Souls rules, **calendar** lines (see [CONTEXT_SCORING_CALENDAR.md](CONTEXT_SCORING_CALENDAR.md)), and non-scored connector snippets (contacts, weather, news) from [`dataToRelevanceStringsWithoutEmail`](../src/connectors/index.ts). Raw email dumps are **not** duplicated there; only the scored lines represent email in the prompt path for user turns.

## Proactive pipeline

**New-mail** proactive evaluation uses the same **per-email** scoring helpers in a different flow (`pendingNotifications.ts`). That is separate from the user-turn top-K formatting described here. See [CONTEXT_SCORING.md](CONTEXT_SCORING.md).
