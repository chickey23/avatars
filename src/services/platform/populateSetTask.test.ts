import { describe, expect, it, vi, beforeEach } from "vitest";
import { populateSetFromWikidataForPlan } from "./populateSetTask";
import type { AvatarCreationPlan } from "../complexTasks/avatarCreationPlanner";
import * as resolveMod from "../knowledgeBase/wikidataResolve";
import * as wk from "../worldviewKnowledge/store";

const plan: AvatarCreationPlan = {
  kind: "set_discovery",
  projectTitle: "Crew",
  originalRequest: "crew of X",
  subjects: [],
  discoveryQuery: "crew of X",
  planId: "plan1234",
};

describe("populateSetFromWikidataForPlan", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(wk, "getKnowledgeSet").mockReturnValue(null);
  });

  it("persists knowledge set when resolver returns enough members", async () => {
    const upsert = vi.spyOn(wk, "upsertKnowledgeSet").mockImplementation(() => {});
    vi.spyOn(resolveMod, "resolveWikidataCastMembers").mockResolvedValue({
      workQid: "Q9",
      workLabel: "Work",
      members: [
        { name: "A", qid: "Q1", descriptors: [] },
        { name: "B", qid: "Q2", descriptors: [] },
        { name: "C", qid: "Q3", descriptors: [] },
      ],
      notices: [],
    });
    vi.spyOn(resolveMod, "wikidataResultToKnowledgeSet").mockReturnValue({
      setKey: "k",
      label: "Work",
      members: [
        { name: "A", qid: "Q1", descriptors: [] },
        { name: "B", qid: "Q2", descriptors: [] },
        { name: "C", qid: "Q3", descriptors: [] },
      ],
      sourceQid: "Q9",
      fetchedAt: 1,
      provenance: ["wikidata:Q9"],
    });

    const r = await populateSetFromWikidataForPlan(plan);
    expect(r.usedWikidata).toBe(true);
    expect(r.partialRoster).toBe(false);
    expect(r.subjectNames).toEqual(["A", "B", "C"]);
    expect(r.notices).toContain("wikidata_resolved");
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("upserts partial roster when fewer than three members", async () => {
    const upsert = vi.spyOn(wk, "upsertKnowledgeSet").mockImplementation(() => {});
    vi.spyOn(resolveMod, "resolveWikidataCastMembers").mockResolvedValue({
      workQid: "Q9",
      workLabel: "Work",
      members: [{ name: "A", qid: "Q1", descriptors: [] }],
      notices: [],
    });
    vi.spyOn(resolveMod, "wikidataResultToKnowledgeSet").mockReturnValue({
      setKey: "k",
      label: "Work",
      members: [{ name: "A", qid: "Q1", descriptors: [] }],
      sourceQid: "Q9",
      fetchedAt: 1,
      provenance: ["wikidata:Q9"],
    });

    const r = await populateSetFromWikidataForPlan(plan);
    expect(r.usedWikidata).toBe(true);
    expect(r.partialRoster).toBe(true);
    expect(r.subjectNames).toEqual(["A"]);
    expect(r.notices).toContain("wikidata_partial_roster");
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  it("tries later discovery queries when the first Wikidata attempt is too small", async () => {
    const upsert = vi.spyOn(wk, "upsertKnowledgeSet").mockImplementation(() => {});
    const resolve = vi.spyOn(resolveMod, "resolveWikidataCastMembers");
    resolve
      .mockResolvedValueOnce({
        workQid: "Q9",
        workLabel: "Work",
        members: [{ name: "A", qid: "Q1", descriptors: [] }],
        notices: ["low"],
      })
      .mockResolvedValueOnce({
        workQid: "Q9",
        workLabel: "Work",
        members: [
          { name: "A", qid: "Q1", descriptors: [] },
          { name: "B", qid: "Q2", descriptors: [] },
          { name: "C", qid: "Q3", descriptors: [] },
        ],
        notices: [],
      });
    const toKs = vi.spyOn(resolveMod, "wikidataResultToKnowledgeSet");
    toKs.mockImplementation((_plan, res) => ({
      setKey: "k",
      label: res.workLabel,
      members: res.members.map((m) => ({
        name: m.name,
        qid: m.qid,
        descriptors: m.descriptors ?? [],
      })),
      sourceQid: res.workQid,
      fetchedAt: 1,
      provenance: [`wikidata:${res.workQid}`],
    }));

    const multiPlan: AvatarCreationPlan = {
      ...plan,
      discoveryQuery: "alpha",
      discoverySearchQueries: ["alpha", "beta"],
    };
    const r = await populateSetFromWikidataForPlan(multiPlan);
    expect(r.usedWikidata).toBe(true);
    expect(r.partialRoster).toBe(false);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
