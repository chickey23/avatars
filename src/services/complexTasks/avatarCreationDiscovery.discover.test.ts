import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRunTargetedSearch } = vi.hoisted(() => ({
  mockRunTargetedSearch: vi.fn(),
}));

vi.mock("../targetedSearch", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../targetedSearch")>();
  return { ...actual, runTargetedSearch: mockRunTargetedSearch };
});

import { discoverSetMembers } from "./avatarCreationDiscovery";

describe("discoverSetMembers (mocked targeted search)", () => {
  beforeEach(() => {
    mockRunTargetedSearch.mockReset();
  });

  it("returns no names for Lower Decks wiki title noise (regression)", async () => {
    mockRunTargetedSearch.mockResolvedValue({
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
        {
          title: "List of Star Trek: Voyager characters - Wikipedia",
          url: "https://en.wikipedia.org/wiki/List_of_Star_Trek:_Voyager_characters",
          snippet: "Characters from Voyager.",
          source: "wikipedia",
        },
      ],
      providersTried: ["wikipedia"],
      notices: [],
    });

    const r = await discoverSetMembers(
      "main crew of Lower Decks members characters list"
    );

    expect(r.names).toEqual([]);
    expect(r.sourceLines.some((l) => l.includes("Star_Trek"))).toBe(true);
    expect(r.sourceLines.some((l) => l.includes("List_of_Star_Trek"))).toBe(
      true
    );
  });
});
