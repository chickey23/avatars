import { describe, expect, it } from "vitest";
import type { TargetedSearchResponse } from "../targetedSearch";
import {
  deriveStopwordsFromQuery,
  discoverSetMembersFromHits,
  extractNamesFromSearchCorpus,
  looksLikePersonName,
  primaryTitleSegment,
  stripTrailingParenthetical,
} from "./avatarCreationDiscovery";

describe("avatarCreationDiscovery helpers", () => {
  it("strips trailing parenthetical from titles", () => {
    expect(stripTrailingParenthetical("Firefly (TV series)")).toBe("Firefly");
  });

  it("takes primary segment before dash in hit titles", () => {
    expect(primaryTitleSegment("Malcolm Reynolds - Wikipedia")).toBe(
      "Malcolm Reynolds"
    );
  });

  it("extracts Title Case multi-word names from corpus with empty stopwords", () => {
    const corpus = `
      The crew includes Malcolm Reynolds and Zoe Washburne.
      Inara Serra appears often.
    `;
    const names = extractNamesFromSearchCorpus(corpus, new Set());
    expect(names).toContain("Malcolm Reynolds");
    expect(names).toContain("Zoe Washburne");
    expect(names).toContain("Inara Serra");
  });
});

describe("deriveStopwordsFromQuery", () => {
  it("keeps franchise tokens and drops scaffolding words", () => {
    const s = deriveStopwordsFromQuery(
      "main crew of Lower Decks members characters list"
    );
    expect(s.has("lower")).toBe(true);
    expect(s.has("decks")).toBe(true);
    expect(s.has("main")).toBe(false);
    expect(s.has("crew")).toBe(false);
    expect(s.has("members")).toBe(false);
    expect(s.has("characters")).toBe(false);
    expect(s.has("list")).toBe(false);
    expect(s.has("of")).toBe(false);
  });
});

const lowerDecksHitsFixture: TargetedSearchResponse = {
  providersTried: ["wikipedia"],
  notices: [],
  hits: [
    {
      title: "Star Trek: Lower Decks - Wikipedia",
      url: "https://en.wikipedia.org/wiki/Star_Trek:_Lower_Decks",
      snippet: "American adult animated television series.",
      source: "wikipedia",
    },
    {
      title: "List of Star Trek: Lower Decks characters - Wikipedia",
      url: "https://en.wikipedia.org/wiki/List_of_Star_Trek:_Lower_Decks_characters",
      snippet: "This is a list of characters from the series.",
      source: "wikipedia",
    },
    {
      title: "Star Trek: Lower Decks season 5 - Wikipedia",
      url: "https://en.wikipedia.org/wiki/Star_Trek:_Lower_Decks_season_5",
      snippet: "Season five of the series.",
      source: "wikipedia",
    },
  ],
};

describe("discoverSetMembersFromHits", () => {
  it("returns no names for Lower Decks Wikipedia-style hits (regression)", () => {
    const query = "main crew of Lower Decks members characters list";
    const r = discoverSetMembersFromHits(query, lowerDecksHitsFixture);
    expect(r.names).toEqual([]);
    expect(r.sourceLines.some((l) => l.includes("Star_Trek"))).toBe(true);
  });
});

describe("looksLikePersonName", () => {
  const lowerDecksQuery = deriveStopwordsFromQuery(
    "main crew of Lower Decks members characters list"
  );
  const fireflyQuery = deriveStopwordsFromQuery(
    "main crew of Firefly members characters list"
  );

  it("rejects reported Wikipedia title noise (Lower Decks query stopwords)", () => {
    expect(looksLikePersonName("Lower Decks", lowerDecksQuery)).toBe(false);
    expect(looksLikePersonName("Lower Decks Star Trek", lowerDecksQuery)).toBe(
      false
    );
  });

  it("rejects colon / list / season titles and franchise junk", () => {
    expect(looksLikePersonName("Star Trek", new Set())).toBe(false);
    expect(looksLikePersonName("Star Trek: Lower Decks", lowerDecksQuery)).toBe(
      false
    );
    expect(
      looksLikePersonName("List of Star Trek characters", lowerDecksQuery)
    ).toBe(false);
    expect(
      looksLikePersonName("Star Trek: Lower Decks season 5", lowerDecksQuery)
    ).toBe(false);
    expect(looksLikePersonName("All Access List", lowerDecksQuery)).toBe(false);
  });

  it("accepts typical cast names when stopwords do not collide", () => {
    expect(looksLikePersonName("Malcolm Reynolds", fireflyQuery)).toBe(true);
    expect(looksLikePersonName("Inara Serra", fireflyQuery)).toBe(true);
    expect(looksLikePersonName("Zoe Washburne", fireflyQuery)).toBe(true);
  });

  it("rejects single-word and five-word strings", () => {
    expect(looksLikePersonName("Malcolm", new Set())).toBe(false);
    expect(
      looksLikePersonName("One Two Three Four Five", new Set())
    ).toBe(false);
  });
});
