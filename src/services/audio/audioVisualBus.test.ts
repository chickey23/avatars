import { describe, expect, it } from "vitest";
import {
  emitAudioVisualCue,
  subscribeAudioVisualCue,
  __clearAudioVisualListenersForTests,
} from "./audioVisualBus";

describe("audioVisualBus", () => {
  it("delivers payloads to subscribers in order", () => {
    __clearAudioVisualListenersForTests();
    const seen: string[] = [];
    const off = subscribeAudioVisualCue((p) => {
      seen.push(`${p.anchor}:${p.cueId ?? ""}`);
    });
    emitAudioVisualCue({ anchor: "storage", cueId: "a", atMs: 1 });
    emitAudioVisualCue({ anchor: "switchboard", cueId: "b" });
    expect(seen).toEqual(["storage:a", "switchboard:b"]);
    off();
    emitAudioVisualCue({ anchor: "global", cueId: "c" });
    expect(seen).toEqual(["storage:a", "switchboard:b"]);
  });

  it("unsubscribe stops delivery", () => {
    __clearAudioVisualListenersForTests();
    let n = 0;
    const off = subscribeAudioVisualCue(() => {
      n += 1;
    });
    off();
    emitAudioVisualCue({ anchor: "avatar", avatarId: "x" });
    expect(n).toBe(0);
  });
});
