import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  appendTopicSegment,
  buildTopicSegmentRecord,
  loadTopicSegments,
  TOPIC_SEGMENTS_KEY,
} from "./conversationSegments";

describe("conversationSegments", () => {
  const store: Record<string, string> = {};
  beforeEach(() => {
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        for (const k of Object.keys(store)) delete store[k];
      },
      key: (i: number) => Object.keys(store)[i] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    } as Storage;
  });
  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
  });

  it("appends and reloads segments", () => {
    localStorage.removeItem(TOPIC_SEGMENTS_KEY);
    const r = buildTopicSegmentRecord(
      "user-msg-1",
      { project: { id: "p1", title: "P" } },
      "done"
    );
    appendTopicSegment(r);
    const all = loadTopicSegments();
    expect(all.length).toBe(1);
    expect(all[0].afterUserMessageId).toBe("user-msg-1");
    expect(all[0].projectId).toBe("p1");
    localStorage.removeItem(TOPIC_SEGMENTS_KEY);
  });
});
