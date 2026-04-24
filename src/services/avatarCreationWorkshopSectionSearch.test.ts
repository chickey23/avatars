import { describe, expect, it } from "vitest";
import {
  AVATAR_BUILDER_INTERNET_SECTIONS,
  buildSectionQuery,
  hostnamesFromSearchHits,
} from "./avatarCreationWorkshopSectionSearch";
import type { TargetedSearchHit } from "./targetedSearch";

function hit(url: string): TargetedSearchHit {
  return {
    title: "t",
    url,
    snippet: "",
    source: "test",
  };
}

describe("hostnamesFromSearchHits", () => {
  it("dedupes hosts case-insensitively", () => {
    expect(
      hostnamesFromSearchHits([
        hit("https://En.Wikipedia.org/wiki/X"),
        hit("https://en.wikipedia.org/wiki/Y"),
        hit("https://starwars.fandom.com/wiki/Z"),
      ])
    ).toEqual(["en.wikipedia.org", "starwars.fandom.com"]);
  });

  it("returns empty for invalid URLs", () => {
    expect(hostnamesFromSearchHits([hit("not-a-url")])).toEqual([]);
  });

  it("caps at 8 hosts", () => {
    const hits = Array.from({ length: 12 }, (_, i) =>
      hit(`https://h${i}.example.com/a`)
    );
    expect(hostnamesFromSearchHits(hits)).toHaveLength(8);
  });
});

describe("buildSectionQuery", () => {
  it("omits site clause when no hostnames", () => {
    const q = buildSectionQuery("Luke Skywalker", "givenName", []);
    expect(q).toBe("Luke Skywalker official name spelling common name cited");
    expect(q).not.toContain("site:");
  });

  it("appends site OR group", () => {
    const q = buildSectionQuery("Luke Skywalker", "givenName", [
      "en.wikipedia.org",
      "starwars.fandom.com",
    ]);
    expect(q).toContain("(site:en.wikipedia.org OR site:starwars.fandom.com)");
  });

  it("preserves special characters in base", () => {
    const base = `O'Brien & "friend" (TNG)`;
    const q = buildSectionQuery(base, "appellation", []);
    expect(q.startsWith(base)).toBe(true);
  });

  it("covers every section id from AVATAR_BUILDER_INTERNET_SECTIONS", () => {
    for (const s of AVATAR_BUILDER_INTERNET_SECTIONS) {
      const q = buildSectionQuery("topic", s.id, ["a.example.org"]);
      expect(q).toContain("topic");
      expect(q).toContain("site:a.example.org");
    }
  });
});
