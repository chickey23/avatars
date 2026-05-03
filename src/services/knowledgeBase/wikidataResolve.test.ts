import { describe, expect, it } from "vitest";
import type { WikidataTransport } from "./wikidataResolve";
import {
  discoverySetKeyForPlan,
  resolveCastForWork,
  resolveWikidataCastMembers,
  searchRankedWorks,
  wikidataResultToKnowledgeSet,
} from "./wikidataResolve";
import type { AvatarCreationPlan } from "../complexTasks/avatarCreationPlanner";

const planStub = (q: string): AvatarCreationPlan => ({
  kind: "set_discovery",
  projectTitle: "Test",
  originalRequest: q,
  subjects: [],
  discoveryQuery: q,
  planId: "abc12345",
});

describe("resolveWikidataCastMembers", () => {
  it("parses SPARQL bindings and merges optional voice actor", async () => {
    const transport: WikidataTransport = {
      async searchEntities() {
        return [
          {
            id: "Q111",
            label: "Example Series",
            description: "American animated television series",
          },
        ];
      },
      async sparql() {
        return {
          results: {
            bindings: [
              {
                character: { type: "uri", value: "http://www.wikidata.org/entity/Q1" },
                characterLabel: { type: "literal", value: "Alpha One" },
                va: { type: "uri", value: "http://www.wikidata.org/entity/Q2" },
                vaLabel: { type: "literal", value: "Actor Bee" },
              },
              {
                character: { type: "uri", value: "http://www.wikidata.org/entity/Q3" },
                characterLabel: { type: "literal", value: "Gamma Two" },
              },
            ],
          },
        };
      },
    };
    const r = await resolveWikidataCastMembers("example crew", transport);
    expect(r.workQid).toBe("Q111");
    expect(r.members).toHaveLength(2);
    const a1 = r.members.find((m) => m.qid === "Q1");
    expect(a1?.name).toBe("Alpha One");
    expect(a1?.actor).toBe("Actor Bee");
    const g = r.members.find((m) => m.qid === "Q3");
    expect(g?.name).toBe("Gamma Two");
    expect(g?.actor).toBeUndefined();
  });

  it("returns notices when search returns no entities", async () => {
    const transport: WikidataTransport = {
      async searchEntities() {
        return [];
      },
      async sparql() {
        return { results: { bindings: [] } };
      },
    };
    const r = await resolveWikidataCastMembers("zzzunknownzzz", transport);
    expect(r.members).toEqual([]);
    expect(r.notices).toContain("wikidata_no_entities");
  });

  it("tries the next search hit when the top work has no P1441 cast", async () => {
    const qNoCast = "Q900001";
    const qWithCast = "Q900002";
    let sparqlCalls = 0;
    const transport: WikidataTransport = {
      async searchEntities() {
        return [
          {
            id: qNoCast,
            label: "Legion of Doom (fictional team)",
            description: "American animated television series",
          },
          {
            id: qWithCast,
            label: "Challenge of the Super Friends",
            description: "American animated television series",
          },
        ];
      },
      async sparql(sparql: string) {
        sparqlCalls += 1;
        if (sparql.includes(qNoCast)) {
          return { results: { bindings: [] } };
        }
        return {
          results: {
            bindings: [
              {
                character: { type: "uri", value: "http://www.wikidata.org/entity/Q10" },
                characterLabel: { type: "literal", value: "Lex Luthor" },
              },
              {
                character: { type: "uri", value: "http://www.wikidata.org/entity/Q11" },
                characterLabel: { type: "literal", value: "Cheetah" },
              },
              {
                character: { type: "uri", value: "http://www.wikidata.org/entity/Q12" },
                characterLabel: { type: "literal", value: "Giganta" },
              },
            ],
          },
        };
      },
    };
    const r = await resolveWikidataCastMembers("legion of doom", transport);
    expect(r.workQid).toBe(qWithCast);
    expect(r.members).toHaveLength(3);
    expect(r.notices).toContain("wikidata_alt_work_pick");
    expect(sparqlCalls).toBe(2);
  });
});

describe("searchRankedWorks", () => {
  it("returns query_empty for blank query", async () => {
    const r = await searchRankedWorks("   ", {
      async searchEntities() {
        throw new Error("should not search");
      },
      async sparql() {
        return {};
      },
    });
    expect(r.ranked).toEqual([]);
    expect(r.notices).toContain("query_empty");
  });

  it("returns wikidata_no_entities when search is empty", async () => {
    const r = await searchRankedWorks("nohits", {
      async searchEntities() {
        return [];
      },
      async sparql() {
        return {};
      },
    });
    expect(r.ranked).toEqual([]);
    expect(r.notices).toContain("wikidata_no_entities");
  });

  it("ranks entities and adds wikidata_ambiguous_top2 when top two scores tie closely", async () => {
    const r = await searchRankedWorks("super friends crew", {
      async searchEntities() {
        return [
          {
            id: "Q1",
            label: "Challenge of the Super Friends",
            description: "American animated television series",
          },
          {
            id: "Q2",
            label: "Super Friends (comic)",
            description: "American animated television series",
          },
        ];
      },
      async sparql() {
        return {};
      },
    });
    expect(r.ranked.map((e) => e.id)).toEqual(["Q1", "Q2"]);
    expect(r.notices).toContain("wikidata_ambiguous_top2");
  });
});

describe("resolveCastForWork", () => {
  it("returns work_qid_invalid for bad ids", async () => {
    const r = await resolveCastForWork("not-a-qid", {
      async searchEntities() {
        return [];
      },
      async sparql() {
        throw new Error("no sparql");
      },
    });
    expect(r.members).toEqual([]);
    expect(r.notices).toContain("work_qid_invalid");
  });

  it("returns wikidata_sparql_error when SPARQL throws", async () => {
    const r = await resolveCastForWork("Q99", {
      async searchEntities() {
        return [];
      },
      async sparql() {
        throw new Error("network down");
      },
    });
    expect(r.members).toEqual([]);
    expect(r.notices).toContain("wikidata_sparql_error");
    expect(r.notices.some((n) => n.includes("network down"))).toBe(true);
  });

  it("returns wikidata_sparql_unavailable when SPARQL returns null", async () => {
    const r = await resolveCastForWork("Q99", {
      async searchEntities() {
        return [];
      },
      async sparql() {
        return null;
      },
    });
    expect(r.members).toEqual([]);
    expect(r.notices).toContain("wikidata_sparql_unavailable");
  });

  it("parses bindings like resolveWikidataCastMembers", async () => {
    const r = await resolveCastForWork("Q111", {
      async searchEntities() {
        return [];
      },
      async sparql() {
        return {
          results: {
            bindings: [
              {
                character: { type: "uri", value: "http://www.wikidata.org/entity/Q1" },
                characterLabel: { type: "literal", value: "Alpha One" },
                va: { type: "uri", value: "http://www.wikidata.org/entity/Q2" },
                vaLabel: { type: "literal", value: "Actor Bee" },
              },
            ],
          },
        };
      },
    });
    expect(r.notices).toEqual([]);
    expect(r.members).toHaveLength(1);
    expect(r.members[0]!.name).toBe("Alpha One");
    expect(r.members[0]!.actor).toBe("Actor Bee");
  });
});

describe("wikidataResultToKnowledgeSet", () => {
  it("returns null when there are no members", () => {
    const plan = planStub("x");
    expect(
      wikidataResultToKnowledgeSet(plan, {
        workQid: "Q1",
        workLabel: "X",
        members: [],
        notices: [],
      })
    ).toBeNull();
  });

  it("builds a knowledge set record when members exist", () => {
    const plan = planStub("main crew of Lower Decks");
    const ks = wikidataResultToKnowledgeSet(plan, {
      workQid: "Q56275898",
      workLabel: "Star Trek: Lower Decks",
      members: [
        {
          name: "Beckett Mariner",
          qid: "Q1",
          actor: "Tawny Newsome",
          actorQid: "Q2",
          descriptors: [],
        },
      ],
      notices: [],
    });
    expect(ks).not.toBeNull();
    expect(ks!.setKey).toBe(discoverySetKeyForPlan(plan));
    expect(ks!.provenance).toEqual(["wikidata:Q56275898"]);
    expect(ks!.members[0]!.actor).toBe("Tawny Newsome");
  });
});
