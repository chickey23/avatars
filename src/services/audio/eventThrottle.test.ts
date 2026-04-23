import { describe, expect, it } from "vitest";
import { createThrottleState, tryThrottle } from "./eventThrottle";

describe("tryThrottle", () => {
  it("allows first fire and blocks inside window", () => {
    const s = createThrottleState();
    expect(tryThrottle(s, 1000, 100)).toBe(true);
    expect(tryThrottle(s, 1000, 500)).toBe(false);
    expect(tryThrottle(s, 1000, 1099)).toBe(false);
    expect(tryThrottle(s, 1000, 1100)).toBe(true);
  });
});
