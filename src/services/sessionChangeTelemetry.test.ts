import { describe, expect, it } from "vitest";
import {
  emitSessionChangeDelta,
  subscribeSessionChangeDelta,
} from "./sessionChangeTelemetry";

describe("sessionChangeTelemetry", () => {
  it("notifies subscribers with positive delta", () => {
    const seen: number[] = [];
    const unsub = subscribeSessionChangeDelta((d) => seen.push(d));
    emitSessionChangeDelta(2);
    emitSessionChangeDelta(1);
    unsub();
    expect(seen).toEqual([2, 1]);
  });

  it("ignores non-positive deltas", () => {
    let n = 0;
    const unsub = subscribeSessionChangeDelta((d) => {
      n += d;
    });
    emitSessionChangeDelta(0);
    emitSessionChangeDelta(-1);
    unsub();
    expect(n).toBe(0);
  });
});
