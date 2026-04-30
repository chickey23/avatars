import { describe, it, expect, beforeEach, vi } from "vitest";
import { emailBodyContentHash } from "./hash";
import {
  loadEmailInsightsDoc,
  saveEmailInsightsDoc,
  peekEmailInsight,
  upsertEmailInsight,
  resetEmailInsightsMemoryForTests,
} from "./store";
import { subscribeSessionChangeDelta } from "../sessionChangeTelemetry";

function installMemoryLocalStorage(): void {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage);
}

describe("email insights store", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    resetEmailInsightsMemoryForTests();
  });

  it("prunes entries older than access TTL on save", () => {
    const old = Date.now() - 20 * 24 * 60 * 60 * 1000;
    saveEmailInsightsDoc({
      schemaVersion: 1,
      entries: {
        m1: {
          messageId: "m1",
          contentHash: "x",
          summary: "s",
          relevance: "uncertain",
          createdAt: old,
          lastAccessedAt: old,
        },
      },
    });
    resetEmailInsightsMemoryForTests();
    const doc = loadEmailInsightsDoc();
    expect(doc.entries.m1).toBeUndefined();
  });

  it("upsert and peek round-trip", () => {
    upsertEmailInsight({
      messageId: "mid",
      contentHash: emailBodyContentHash("body"),
      summary: "sum",
      relevance: "relevant",
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });
    resetEmailInsightsMemoryForTests();
    const row = peekEmailInsight("mid");
    expect(row?.summary).toBe("sum");
  });

  it("emits session change delta on upsertEmailInsight", () => {
    let total = 0;
    const unsub = subscribeSessionChangeDelta((d) => {
      total += d;
    });
    upsertEmailInsight({
      messageId: "m2",
      contentHash: emailBodyContentHash("b2"),
      summary: "cached",
      relevance: "uncertain",
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    });
    unsub();
    expect(total).toBe(1);
  });
});
