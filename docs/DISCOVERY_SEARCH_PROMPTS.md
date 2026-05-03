# Set-discovery search prompts (review matrix)

This document lists the **query templates** used when the user asks for avatars for a **set** (e.g. “members of …”, “each member of …”) and the app runs **Wikidata** plus optional **legacy search**. Code lives in [`src/services/complexTasks/avatarCreationPlanner.ts`](../src/services/complexTasks/avatarCreationPlanner.ts) (`buildSetDiscoverySearchQueries`, `discoverySearchBases`, `discoveryQueriesForPlan`).

**Product stance — expectations over denial:** discovery favors **neutral, retrievable** phrasing (prominence, time, fame). Nothing is blocked for “wrong medium” or small result sets; each pass is **saved** to local worldview (`discoveryRuns` / `memberCandidates` under `knowledgeSets`). Stewardship of **living / recently deceased** subjects stays **advisory** (see [`SPEC.md`](../SPEC.md)).

**How to use this table:** fill the **Approved / revise** column (e.g. `keep`, `remove`, `reword to …`). After sign-off, update the implementation to match.

## Neutral and suffix templates

| Template id | When used | Example expansion | Risk / note | Approved / revise |
|-------------|-----------|---------------------|-------------|---------------------|
| `base` | Every discovery base (stripped user phrase, plus `X from Y` splits) | `legion of doom` | May hit disambiguation pages | |
| `base + well-known` | Primary base, default suffix pool | `æsir well-known` | Broad SERP / entity noise | |
| `base + popular` | Suffix pool | `order of the triad popular` | May favor trending topics | |
| `base + famous` | Suffix pool | `team rocket famous` | | |
| `base + legendary` | Suffix pool | `thor legendary` | May overlap myth keywords | |
| `base + classic` | Suffix pool | `firefly classic` | “Classic” is subjective | |
| `base + ancient` | Suffix pool | `roman senate ancient` | Good for antiquity; weak for modern IP | |
| `base + historical` | Suffix pool | `legion historical` | | |
| `base + original` | Suffix pool | `battlestar galactica original` | Disambiguates reboots vs originals | |
| `base + contemporary` | Suffix pool | `venture brothers contemporary` | | |
| `base + recent` | Suffix pool | `… recent` | **Retrieval only** — not a block on living/recent subjects | |
| `base + mythology` | Suffix pool; boosted when seed hints myth/pantheon | `æsir mythology` | Scholarly vs roster lists | |
| `base + fictional character` | Myth hint + default pool | `æsir fictional character` | May miss entities modeled as deity | |
| `secondary + fictional character` | Non-primary bases (space permitting) | `venture brothers fictional character` | Caps total query count | |
| `base + television series` | **Only** when seed explicitly mentions TV/series/show | `… television series` | Optional media disambiguator | |
| `base + film` | **Only** when seed mentions film/movie/cinema | `… film` | Optional | |
| `base + video game` | **Only** when seed mentions game/console/RPG | `… video game` | Optional | |
| `base + comics` / `novel` / `animated series` | Same `media_explicit` gate | `… comics` | Optional | |

**Order:** all **bases** from `discoverySearchBases` are pushed first (deduped), then suffix variants on the **primary** base, then one light variant on secondary bases until `MAX_DISCOVERY_QUERIES` (10).

## Hint keywords (lightweight)

The seed string is scanned for **optional** suffix ordering, not a full classifier:

| Hint | Trigger patterns (examples) | Suffixes prioritized |
|------|------------------------------|----------------------|
| `myth` | myth, mythology, pantheon, æsir, aesir, vanir, deity, olymp… | mythology, fictional character |
| `media_explicit` | film, movie, tv, television, series, episode, video game, comic, anime, manga, novel, book series… | television series, film, video game, comics, novel, animated series |

If **no** hint matches, the suffix pool is still **prominence / temporal / fame** first (`well-known` … `recent`), then fiction/myth disambiguators — **not** a TV-default.

## Metadata beyond roster names

Incremental discovery stores more than a flat member list:

- **`discoveryRuns`**: each search’s query, notices, truncated source lines, and extracted names.
- **`relatedSetHints`**: cheap strings such as resolved work QID/label (“what set or work a term belongs to”) for later steps and UI.
- **`memberCandidates`**: per-name status (`suggested`, `skipped`, `task_spawned`, …) merged across runs.

See [`src/services/worldviewKnowledge/discoveryKnowledge.ts`](../src/services/worldviewKnowledge/discoveryKnowledge.ts) and [`src/services/worldMetadata/types.ts`](../src/services/worldMetadata/types.ts).

## Stewardship (advisory)

Same as product copy elsewhere: **prefer** fictional, mythological, symbolic, or historical figures you are comfortable representing; **discourage** (do not auto-block) avatars of living people or the **recently deceased (~20 years)** as distasteful.

## Future resolver modes (out of scope for current iteration)

Wikidata **`present in work` (P1441)** fits **fictional narrative appearances** in a work; it is **not** a universal “members of set” relation for taxonomies, pantheons modeled without a single work, or abstract personifications. Follow-ups:

| Mode | Idea | Wikidata sketch |
|------|------|-----------------|
| `P1441_cast` | Current default | `?character wdt:P1441 ?work` |
| `P161_production` | Real cast of audiovisual work | `?human wdt:P161 ?work` (different semantics) |
| `Group_parts` | Organization / team members | part of (P361), has part (P527), participant (P710) — **needs design per domain** |
| `Subclass_enumeration` | Taxonomy / category-style sets | subclass of (P279) / instance of (P31) with limits |

---

**References:** [Property talk:P1441](https://www.wikidata.org/wiki/Property_talk:P1441); [SPARQL alt labels](https://stackoverflow.com/questions/66417040/how-to-query-wikidata-using-sparql-using-entity-names-and-also-check-alternative).
