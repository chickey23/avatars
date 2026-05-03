import { describe, expect, it, beforeEach } from "vitest";
import {
  __resetMonitorsForTests,
  pollAll,
  registerMonitor,
} from "./registry";
import { setSufficiencyMonitor } from "./setSufficiencyMonitor";

describe("setSufficiencyMonitor", () => {
  beforeEach(() => {
    __resetMonitorsForTests();
  });

  it("registers and returns no posts on store_change", async () => {
    registerMonitor(setSufficiencyMonitor);
    const r = await pollAll("store_change", [], {});
    expect(r.postsByMonitor).toHaveLength(0);
  });
});
