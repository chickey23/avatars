import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { migrateWorldMetadataDoc } from "./backend";
import {
  __resetWorldMetadataForTests,
  ensureWorldMetadataLoaded,
  seedCuratedAssertionsIntoWorldMetadata,
  upsertCuratedAssertion,
  getWorldMetadata,
} from "./store";
import { createEmptyWorldMetadataDoc } from "./types";

const lsStore = new Map<string, string>();

describe("curated assertions + migration", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "localStorage",
      {
        get length() {
          return lsStore.size;
        },
        clear() {
          lsStore.clear();
        },
        getItem(k: string) {
          return lsStore.has(k) ? lsStore.get(k)! : null;
        },
        setItem(k: string, v: string) {
          lsStore.set(k, v);
        },
        removeItem(k: string) {
          lsStore.delete(k);
        },
        key() {
          return null;
        },
      } as Storage
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    lsStore.clear();
    __resetWorldMetadataForTests();
  });

  it("migrate preserves curatedAssertions on v3-shaped payload", () => {
    const out = migrateWorldMetadataDoc({
      schemaVersion: 3,
      people: { c: { updatedAt: 1 } },
      projects: {},
      userProfile: { updatedAt: 1 },
      knowledgeSets: {},
      curatedAssertions: {
        ca_1: {
          id: "ca_1",
          object: "A",
          assertion: "B",
          certainty: 0.5,
          source: "t",
          updatedAt: 2,
        },
      },
    });
    expect(out.curatedAssertions?.ca_1?.assertion).toBe("B");
  });

  it("empty migrated doc has curatedAssertions map", () => {
    const out = migrateWorldMetadataDoc(null);
    expect(out.curatedAssertions).toEqual({});
  });

  it("seed twice is idempotent", () => {
    ensureWorldMetadataLoaded();
    const a = seedCuratedAssertionsIntoWorldMetadata();
    expect(a.length).toBeGreaterThan(0);
    const n1 = Object.keys(getWorldMetadata().curatedAssertions ?? {}).length;
    const b = seedCuratedAssertionsIntoWorldMetadata();
    expect(b).toEqual([]);
    expect(Object.keys(getWorldMetadata().curatedAssertions ?? {}).length).toBe(n1);
  });

  it("clamps certainty on upsert", () => {
    ensureWorldMetadataLoaded();
    const r = upsertCuratedAssertion({
      object: "Test",
      assertion: "X",
      certainty: 9,
      source: "unit",
    });
    expect(r.certainty).toBe(1);
    const r2 = upsertCuratedAssertion({
      object: "Test2",
      assertion: "Y",
      certainty: -3,
      source: "unit",
    });
    expect(r2.certainty).toBe(0);
  });

  it("default upsert replaces same object+assertion id; merge allocates new id", () => {
    __resetWorldMetadataForTests();
    ensureWorldMetadataLoaded();
    const first = upsertCuratedAssertion({
      object: "Planet",
      assertion: "Has rings",
      certainty: 1,
      source: "t",
      merge: false,
    });
    const second = upsertCuratedAssertion({
      object: "Planet",
      assertion: "Has rings",
      certainty: 0.2,
      source: "t2",
      merge: false,
    });
    expect(second.id).toBe(first.id);
    expect(getWorldMetadata().curatedAssertions?.[first.id]?.certainty).toBe(0.2);

    const merged = upsertCuratedAssertion({
      object: "Planet",
      assertion: "Gas giant",
      certainty: 1,
      source: "t",
      merge: true,
    });
    expect(merged.id).not.toBe(first.id);
    expect(merged.id.startsWith("ca_m_")).toBe(true);
  });

  it("createEmptyWorldMetadataDoc matches store empty shape", () => {
    const d = createEmptyWorldMetadataDoc();
    expect(d.curatedAssertions).toEqual({});
    expect(d.pendingUserProfilePatch).toBeNull();
  });
});
