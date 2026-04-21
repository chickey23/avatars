# Email context scoring

This document describes how **recent email** from connectors is ranked and summarized for each **user turn** before it reaches avatars via `SituationContext.relevantData`.

## Purpose

The app can fetch many recent messages. Sending all of them verbatim into every LLM prompt would be noisy, slow, and expensive. Email scoring selects a **small, relevance-ordered subset** (top **K**) so the model sees messages that align with the current conversation, task, explicit user focus, and optional world metadata.

## Where it lives

| Piece | Location |
|--------|----------|
| Scoring + formatting | [`src/services/contextScoring/email.ts`](../src/services/contextScoring/email.ts) |
| Focus appendix + soft signals | [`src/services/contextScoring/focusRelevance.ts`](../src/services/contextScoring/focusRelevance.ts) |
| Focus-relative display norms | [`src/services/contextScoring/normFocus.ts`](../src/services/contextScoring/normFocus.ts) |
| Wired into each user turn | [`processUserTurn` in `src/store/appStore.ts`](../src/store/appStore.ts) |
| Unit tests | [`src/services/contextScoring/email.test.ts`](../src/services/contextScoring/email.test.ts) |

## Inputs

- **Emails:** `EmailItem[]` from `gatherDataFromSources()` (Gmail when connected, else mock).
- **Context (`EmailScoringContext`):**
  - **`conversationThread`** — last **N** messages (default **15**) contribute a **keyword corpus** (see [CONTEXT_SCORING.md](CONTEXT_SCORING.md)).
  - **`activeTask`** — optional string folded into the same corpus.
  - **`focus.email`** — if the user focused an email in the UI, that message’s **id** receives a large score bonus so it tends to rank first.
  - **`focusCorpusAppendix`** — lowercase text from the focused email’s subject, snippet, from line, and (when loaded first in `processUserTurn`) a **capped excerpt** of the full body so overlap does not depend only on chat keywords.
  - **`worldMetadataCorpus`** — capped snippets from user profile, focused project, and people overlays (`buildWorldMetadataScoringCorpus`).
  - **`focusSoft`** — shared deterministic signals (tokens from focus email/calendar, same-day vs focused email date) for **soft bonuses** on other messages.

## Scoring mechanics (summary)

1. Build a lowercase **corpus** from `activeTask`, thread tail, `focusCorpusAppendix`, and `worldMetadataCorpus`.
2. For each email, form a **blob** from `from`, `subject`, and `snippet`.
3. **Tokenize** the blob (words of length ≥ 3, alphanumeric-ish), count how many tokens **appear as substrings** in the corpus (capped per email).
4. Add a **focus-id bonus** when `focus.email.id` matches the email’s `id`.
5. Add **soft bonuses** from `focusSoft`: token hits in the blob (venue / show names shared with focus), and **same calendar day / adjacent day** vs the focused email’s `date` when known.
6. Sort by **score descending**, tie-break by **newer `date`**.
7. Take the top **K** (default **5**, `EMAIL_CONTEXT_TOP_K`).
8. **Displayed `score`** on each line is **focus-relative** (`normFocus`): the focused row shows **100**; others use max **base** score (raw minus focus-id bonus) among **non-focus** rows in the batch as the denominator so peers are not all **0** when the focus dominates raw totals. `normScore` (batch max) is still attached on ranked structs for diagnostics.

## Output format

Each selected email becomes one line in `relevantData`, for example:

```text
email [id <gmailMessageId>, rank 1, score 100]: Subject — snippet… (from user@example.com)
```

The **id** is the Gmail message id (same as in Focus). Rank and `score` are **diagnostic**; the LLM uses the line to pick threads and optional `gmail.fetch_message_body` tools.

## Relationship to other strings

`relevantData` also includes focus strings, optional Well of Souls rules, **calendar** lines (see [CONTEXT_SCORING_CALENDAR.md](CONTEXT_SCORING_CALENDAR.md)), and non-scored connector snippets (contacts, weather, news) from [`dataToRelevanceStringsWithoutEmail`](../src/connectors/index.ts). Raw email dumps are **not** duplicated there; only the scored lines represent email in the prompt path for user turns.

## Message body in prompts

[`EmailItem`](../src/connectors/types.ts) stays **snippet-only** in the list; full **body** is fetched in [`processUserTurn`](../src/store/appStore.ts) for the **focused** message **before** ranking so the excerpt can enrich the corpus, then the full body is injected as an `Email body [id]:` block. Up to two **strong-match** top-K rows use **`normFocus`** ≥ `EMAIL_STRONG_MATCH_MIN_NORM` for body prefetch. Avatars may also request **`gmail.fetch_message_body`** (allowlist = ids in the turn’s loaded inbox snapshot; see [WORLD_MODEL_AND_PREPROCESSOR.md](WORLD_MODEL_AND_PREPROCESSOR.md)).

## Ollama “Relevant context” block

[`formatRelevantDataForOllamaPrompt`](../src/services/relevantContextPrompt.ts) truncates individual **email body** blocks (after the `Email body [id]:` header) to a large character cap and appends `[truncated for prompt size]` when needed, to reduce oversized localhost payloads.

## Proactive pipeline

**New-mail** proactive evaluation uses the same **per-email** scoring helpers in a different flow (`pendingNotifications.ts`) with a minimal context (no world-metadata appendix unless extended later). That is separate from the user-turn top-K formatting described here. See [CONTEXT_SCORING.md](CONTEXT_SCORING.md).
