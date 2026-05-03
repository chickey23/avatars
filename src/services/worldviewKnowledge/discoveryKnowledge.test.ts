import { describe, expect, it, beforeEach } from "vitest";
import {
  appendSetDiscoveryRun,
  listOrderedPendingCandidates,
  mergeKnowledgeSetPreserveIncremental,
  normalizeMemberCandidateKey,
  normalizeWikidataWorkQidForExclude,
  rankDiscoveryQueriesForWikidata,
  recordExcludedWikidataWorkQids,
  setMemberCandidateStatus,
} from "./discoveryKnowledge";
import type { KnowledgeSetRecord } from "../worldMetadata/types";
import { __resetWorldMetadataForTests } from "../worldMetadata/store";
import { getKnowledgeSet } from "./store";

describe("discoveryKnowledge", () => {
  beforeEach(() => {
    __resetWorldMetadataForTests();
  });

  it("normalizes candidate keys", () => {
    expect(normalizeMemberCandidateKey("  Thor  ")).toBe("thor");
  });

  it("appends runs and orders pending newest-run first", () => {
    const setKey = "test_set";
    appendSetDiscoveryRun({
      setKey,
      labelFallback: "Test",
      query: "q1",
      notices: [],
      sourceLines: [],
      extractedNames: ["Odin", "Thor"],
    });
    appendSetDiscoveryRun({
      setKey,
      labelFallback: "Test",
      query: "q2",
      notices: [],
      sourceLines: [],
      extractedNames: ["Freya", "Thor"],
    });
    const ks = getKnowledgeSet(setKey);
    const pending = listOrderedPendingCandidates(ks);
    expect(pending.map((p) => p.displayName)).toEqual(["Freya", "Thor", "Odin"]);
  });

  it("setMemberCandidateStatus skips a name", () => {
    const setKey = "s2";
    appendSetDiscoveryRun({
      setKey,
      labelFallback: "T",
      query: "q",
      notices: [],
      sourceLines: [],
      extractedNames: ["A", "B"],
    });
    const ks = getKnowledgeSet(setKey);
    const aKey = normalizeMemberCandidateKey("A");
    setMemberCandidateStatus(setKey, aKey, "skipped");
    const pending = listOrderedPendingCandidates(getKnowledgeSet(setKey));
    expect(pending.map((p) => p.displayName)).toEqual(["B"]);
  });

  it("rankDiscoveryQueriesForWikidata orders higher acceptedMemberCount first", () => {
    const ks: KnowledgeSetRecord = {
      setKey: "rank_test",
      label: "L",
      members: [],
      fetchedAt: 1,
      provenance: [],
      discoveryRuns: [
        {
          runId: "r1",
          at: 100,
          query: "alpha crew",
          notices: [],
          sourceLines: [],
          extractedNames: [],
          sourceKind: "wikidata_auto",
          acceptedMemberCount: 5,
        },
        {
          runId: "r2",
          at: 200,
          query: "beta crew",
          notices: [],
          sourceLines: [],
          extractedNames: [],
          sourceKind: "wikidata_auto",
          acceptedMemberCount: 1,
        },
      ],
    };
    const out = rankDiscoveryQueriesForWikidata(ks, ["beta crew", "alpha crew", "gamma"]);
    expect(out).toEqual(["alpha crew", "beta crew", "gamma"]);
  });

  it("increments acceptedMemberCount on credited run when candidate is task_spawned", () => {
    const setKey = "accept_test";
    appendSetDiscoveryRun({
      setKey,
      labelFallback: "T",
      query: "old",
      notices: [],
      sourceLines: [],
      extractedNames: ["Old"],
      sourceKind: "wikidata_auto",
    });
    appendSetDiscoveryRun({
      setKey,
      labelFallback: "T",
      query: "new",
      notices: [],
      sourceLines: [],
      extractedNames: ["New"],
      sourceKind: "wikidata_auto",
    });
    const ks = getKnowledgeSet(setKey)!;
    const runs = ks.discoveryRuns!;
    expect(runs).toHaveLength(2);
    const newKey = normalizeMemberCandidateKey("New");
    const cand = ks.memberCandidates![newKey]!;
    expect(cand.seenInRunIds).toContain(runs[1]!.runId);

    setMemberCandidateStatus(setKey, newKey, "task_spawned");
    const after = getKnowledgeSet(setKey)!;
    const rOld = after.discoveryRuns!.find((r) => r.runId === runs[0]!.runId)!;
    const rNew = after.discoveryRuns!.find((r) => r.runId === runs[1]!.runId)!;
    expect(rOld.acceptedMemberCount ?? 0).toBe(0);
    expect(rNew.acceptedMemberCount).toBe(1);
  });

  it("mergeKnowledgeSetPreserveIncremental keeps excludedWikidataWorkQids when next omits", () => {
    const prev: KnowledgeSetRecord = {
      setKey: "k1",
      label: "L",
      members: [],
      fetchedAt: 1,
      provenance: [],
      excludedWikidataWorkQids: ["Q100"],
    };
    const next: KnowledgeSetRecord = {
      setKey: "k1",
      label: "L2",
      members: [{ name: "A", descriptors: [] }],
      fetchedAt: 2,
      provenance: ["p"],
    };
    const m = mergeKnowledgeSetPreserveIncremental(prev, next);
    expect(m.excludedWikidataWorkQids).toEqual(["Q100"]);
  });

  it("recordExcludedWikidataWorkQids merges and dedupes", () => {
    recordExcludedWikidataWorkQids("ks1", ["Q100", "q100", "Q200"], "Fallback");
    const ks = getKnowledgeSet("ks1");
    expect(ks?.excludedWikidataWorkQids).toEqual(["Q100", "Q200"]);
  });

  it("normalizeWikidataWorkQidForExclude normalizes or rejects", () => {
    expect(normalizeWikidataWorkQidForExclude("wd:q55")).toBe("Q55");
    expect(normalizeWikidataWorkQidForExclude("bad")).toBeNull();
  });
});
