import { describe, it, expect, beforeEach } from "vitest";
import type { ConversationMessage } from "../../types";
import {
  __resetSyntheticPostForTests,
  postSyntheticMessage,
  setSyntheticPostSink,
  postMonitorPost,
} from "./postSynthetic";
import { PLATFORM_ATTRIBUTION_AVATAR_ID } from "../platform/constants";

describe("postSyntheticMessage", () => {
  beforeEach(() => {
    __resetSyntheticPostForTests();
  });

  it("returns false silently when no sink is registered", () => {
    const ok = postSyntheticMessage({
      avatarId: PLATFORM_ATTRIBUTION_AVATAR_ID,
      monitorTag: "monitor:foo",
      content: "hi",
    });
    expect(ok).toBe(false);
  });

  it("routes a posted message through the registered sink", () => {
    const got: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => got.push(message));
    const ok = postSyntheticMessage({
      avatarId: PLATFORM_ATTRIBUTION_AVATAR_ID,
      monitorTag: "monitor:foo",
      content: "hello",
    });
    expect(ok).toBe(true);
    expect(got).toHaveLength(1);
    expect(got[0]?.synthetic).toBe(true);
    expect(got[0]?.monitorTag).toBe("monitor:foo");
    expect(got[0]?.avatarId).toBe(PLATFORM_ATTRIBUTION_AVATAR_ID);
    expect(got[0]?.content).toBe("hello");
    expect(got[0]?.role).toBe("avatar");
    expect(got[0]?.responseRequirement).toBe("satisfied");
  });

  it("dedups identical (monitorTag, dedupKey) pairs inside the window", () => {
    const got: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => got.push(message));
    const ok1 = postSyntheticMessage({
      avatarId: "a",
      monitorTag: "monitor:foo",
      content: "same",
      dedupKey: "k1",
    });
    const ok2 = postSyntheticMessage({
      avatarId: "a",
      monitorTag: "monitor:foo",
      content: "different body but same key",
      dedupKey: "k1",
    });
    expect(ok1).toBe(true);
    expect(ok2).toBe(false);
    expect(got).toHaveLength(1);
  });

  it("dedups on content hash when dedupKey is omitted", () => {
    const got: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => got.push(message));
    postSyntheticMessage({
      avatarId: "a",
      monitorTag: "monitor:foo",
      content: "x",
    });
    postSyntheticMessage({
      avatarId: "a",
      monitorTag: "monitor:foo",
      content: "x",
    });
    expect(got).toHaveLength(1);
  });

  it("maps MonitorAction[] to syntheticActions", () => {
    const got: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => got.push(message));
    postMonitorPost(
      {
        avatarId: "a",
        content: "choose",
        actions: [
          { id: "yes", label: "Yes", payload: { x: 1 } },
          { id: "no", label: "No" },
        ],
      },
      "foo"
    );
    expect(got[0]?.syntheticActions).toEqual([
      { id: "yes", label: "Yes", payload: { x: 1 } },
      { id: "no", label: "No", payload: undefined },
    ]);
  });
});
