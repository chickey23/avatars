import { describe, it, expect, beforeEach } from "vitest";
import {
  SOURCE_RUNNER_KINDS,
  sourceRunnerMonitorName,
  sourceRunnerMonitors,
  isSourceRunnerKind,
} from "./sourceRunners";
import {
  registerMonitor,
  pollAll,
  __resetMonitorsForTests,
} from "./registry";
import {
  buildUnclaimedContractsWarning,
  UNCLAIMED_CONTRACTS_MONITOR_NAME,
} from "./unclaimedContracts";
import type { Avatar } from "../../types";

const mk = (over: Partial<Avatar>): Avatar =>
  ({
    id: "a",
    processName: "a",
    givenName: "A",
    appellation: "a",
    description: "",
    tags: [],
    personality: "",
    interests: [],
    assignedTasks: [],
    opinions: {},
    ...over,
  }) as Avatar;

describe("sourceRunners contract definitions", () => {
  beforeEach(() => __resetMonitorsForTests());

  it("emits one MonitorDef per source kind, all required, with the correct triggers", async () => {
    expect(SOURCE_RUNNER_KINDS).toEqual(["email", "calendar", "contacts"]);
    for (const m of sourceRunnerMonitors) {
      expect(m.required).toBe(true);
      expect(m.triggers).toEqual(["startup", "source_change"]);
      expect(m.name).toMatch(/^source_runner:(email|calendar|contacts)$/);
      const result = await m.run({
        ownerAvatarId: "anyone",
        catalog: [],
        trigger: "startup",
        now: Date.now(),
      });
      expect(result).toEqual([]);
    }
  });

  it("monitor names round-trip through sourceRunnerMonitorName / isSourceRunnerKind", () => {
    expect(sourceRunnerMonitorName("email")).toBe("source_runner:email");
    expect(isSourceRunnerKind("email")).toBe(true);
    expect(isSourceRunnerKind("nope")).toBe(false);
  });

  it("registers and resolves to the tagged steward avatar", async () => {
    for (const m of sourceRunnerMonitors) registerMonitor(m);
    const inboxSteward = mk({
      id: "inbox_steward",
      systemTags: ["system", "monitor:source_runner:email"],
    });
    const calendarSteward = mk({
      id: "calendar_steward",
      systemTags: ["system", "monitor:source_runner:calendar"],
    });
    const result = await pollAll("startup", [inboxSteward, calendarSteward]);
    /** contacts has no claimant; the others are claimed exactly once. */
    expect(result.unclaimed).toContain("source_runner:contacts");
    expect(result.unclaimed).not.toContain("source_runner:email");
    expect(result.unclaimed).not.toContain("source_runner:calendar");
    expect(result.duplicate).toEqual([]);
  });

  it("removing the lone steward surfaces the contract as unclaimed and the warner names it", async () => {
    for (const m of sourceRunnerMonitors) registerMonitor(m);
    /** Fallback steward exists so the warning has an author. */
    const fallback = mk({
      id: "fallback",
      systemTags: ["system", "monitor:unclaimed_contracts"],
    });
    const result = await pollAll("startup", [fallback]);
    expect(result.unclaimed.sort()).toEqual([
      "source_runner:calendar",
      "source_runner:contacts",
      "source_runner:email",
    ]);
    const warning = buildUnclaimedContractsWarning({
      catalog: [fallback],
      unclaimed: result.unclaimed,
      duplicate: result.duplicate,
    });
    expect(warning).not.toBeNull();
    expect(warning!.post.content).toContain("source_runner:email");
    expect(warning!.post.content).toContain("source_runner:calendar");
    expect(warning!.post.content).toContain("source_runner:contacts");
    expect(warning!.authorAvatarId).toBe("fallback");
    expect(UNCLAIMED_CONTRACTS_MONITOR_NAME).toBe("unclaimed_contracts");
  });
});
