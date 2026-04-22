import { describe, it, expect, beforeEach } from "vitest";
import {
  contractLog,
  parseContractLogCategory,
  CONTRACT_LOG_PREFIX,
} from "./contractLog";
import { getSessionLogSnapshot } from "../sessionLog";

describe("contractLog", () => {
  beforeEach(() => {
    /** Drain whatever the global session log has accumulated. */
    const all = getSessionLogSnapshot() as Array<unknown>;
    while (all.length > 0) all.pop();
  });

  it("emits categories with the contract: prefix and event suffix", () => {
    contractLog("source_runner:email", "runner_tick", "tick", { level: "info" });
    const all = getSessionLogSnapshot();
    const entry = all[all.length - 1]!;
    expect(entry.category).toBe(`${CONTRACT_LOG_PREFIX}source_runner:email__runner_tick`);
    expect(entry.message).toBe("tick");
    expect(entry.level).toBe("info");
  });

  it("parseContractLogCategory round-trips contract + event", () => {
    expect(parseContractLogCategory("contract:source_runner:email__runner_tick")).toEqual({
      contract: "source_runner:email",
      event: "runner_tick",
    });
    expect(parseContractLogCategory("contract:due_and_snoozed_items__scheduler_fire")).toEqual({
      contract: "due_and_snoozed_items",
      event: "scheduler_fire",
    });
  });

  it("returns null for non-contract categories", () => {
    expect(parseContractLogCategory("platform_runner_tick")).toBeNull();
    expect(parseContractLogCategory("session")).toBeNull();
  });

  it("contract with no event suffix yields empty event", () => {
    expect(parseContractLogCategory("contract:bare")).toEqual({
      contract: "bare",
      event: "",
    });
  });
});
