import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetWorldMetadataForTests,
  patchKnowledgeSets,
} from "../worldMetadata/store";
import { getKnowledgeSet, upsertKnowledgeSet } from "./store";

describe("worldviewKnowledge store", () => {
  beforeEach(() => {
    __resetWorldMetadataForTests();
  });

  it("round-trips a knowledge set", () => {
    upsertKnowledgeSet({
      setKey: "test_set",
      label: "Test work",
      members: [{ name: "A", qid: "Q1", descriptors: [] }],
      sourceQid: "Q99",
      fetchedAt: 1,
      provenance: ["wikidata:Q99"],
    });
    const got = getKnowledgeSet("test_set");
    expect(got?.label).toBe("Test work");
    expect(got?.members).toHaveLength(1);
    patchKnowledgeSets({ test_set: null });
    expect(getKnowledgeSet("test_set")).toBeNull();
  });
});
