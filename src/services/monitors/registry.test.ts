import { describe, it, expect, beforeEach } from "vitest";
import type { Avatar } from "../../types";
import {
  __resetMonitorsForTests,
  pollAll,
  registerMonitor,
  listRegisteredMonitors,
} from "./registry";
import { buildUnclaimedContractsWarning } from "./unclaimedContracts";
import { PLATFORM_ATTRIBUTION_AVATAR_ID } from "../platform/constants";

const mk = (id: string, systemTags?: string[]): Avatar =>
  ({
    id,
    processName: id,
    givenName: id,
    appellation: id,
    description: "",
    tags: [],
    personality: "",
    interests: [],
    assignedTasks: [],
    opinions: {},
    systemTags,
  }) as Avatar;

describe("MonitorRegistry", () => {
  beforeEach(() => {
    __resetMonitorsForTests();
  });

  it("registers monitors and exposes them in order", () => {
    registerMonitor({
      name: "a",
      required: true,
      triggers: ["startup"],
      run: () => [],
    });
    registerMonitor({
      name: "b",
      required: false,
      triggers: ["startup"],
      run: () => [],
    });
    expect(listRegisteredMonitors().map((m) => m.name)).toEqual(["a", "b"]);
  });

  it("skips monitors whose triggers do not include the reason", async () => {
    registerMonitor({
      name: "only_store",
      required: true,
      triggers: ["store_change"],
      run: () => [{ avatarId: "x", content: "ran" }],
    });
    const cat = [mk("x", ["monitor:only_store"])];
    const startup = await pollAll("startup", cat);
    expect(startup.postsByMonitor).toEqual([]);
    const store = await pollAll("store_change", cat);
    expect(store.postsByMonitor[0]?.posts[0]?.content).toBe("ran");
  });

  it("reports unclaimed required monitors", async () => {
    registerMonitor({
      name: "lonely",
      required: true,
      triggers: ["startup"],
      run: () => [{ avatarId: "x", content: "never" }],
    });
    const cat = [mk("x")];
    const res = await pollAll("startup", cat);
    expect(res.unclaimed).toEqual(["lonely"]);
    expect(res.postsByMonitor).toEqual([]);
  });

  it("reports duplicate claimants and still runs the first", async () => {
    registerMonitor({
      name: "dup",
      required: true,
      triggers: ["startup"],
      run: (ctx) => [{ avatarId: ctx.ownerAvatarId, content: ctx.ownerAvatarId }],
    });
    const cat = [mk("a", ["monitor:dup"]), mk("b", ["monitor:dup"])];
    const res = await pollAll("startup", cat);
    expect(res.duplicate).toEqual(["dup"]);
    expect(res.postsByMonitor[0]?.posts[0]?.avatarId).toBe("a");
  });

  it("passes the claimant as ownerAvatarId", async () => {
    let seen = "";
    registerMonitor({
      name: "record_owner",
      required: true,
      triggers: ["startup"],
      run: (ctx) => {
        seen = ctx.ownerAvatarId;
        return [];
      },
    });
    await pollAll("startup", [mk("claimant", ["monitor:record_owner"])]);
    expect(seen).toBe("claimant");
  });

  it("swallows monitor errors so one bad monitor cannot take down others", async () => {
    registerMonitor({
      name: "bad",
      required: true,
      triggers: ["startup"],
      run: () => {
        throw new Error("boom");
      },
    });
    registerMonitor({
      name: "good",
      required: true,
      triggers: ["startup"],
      run: () => [{ avatarId: "g", content: "ok" }],
    });
    const cat = [
      mk("x", ["monitor:bad"]),
      mk("g", ["monitor:good"]),
    ];
    const res = await pollAll("startup", cat);
    expect(res.postsByMonitor.length).toBe(1);
    expect(res.postsByMonitor[0]?.name).toBe("good");
  });
});

describe("buildUnclaimedContractsWarning", () => {
  it("returns null when nothing is unclaimed or duplicated", () => {
    expect(
      buildUnclaimedContractsWarning({ catalog: [], unclaimed: [], duplicate: [] })
    ).toBeNull();
  });

  it("authors via monitor:unclaimed_contracts claimant when present", () => {
    const cat = [
      mk(PLATFORM_ATTRIBUTION_AVATAR_ID, [
        "system",
        "monitor:unclaimed_contracts",
      ]),
      mk("other", ["system"]),
    ];
    const out = buildUnclaimedContractsWarning({
      catalog: cat,
      unclaimed: ["foo"],
      duplicate: [],
    });
    expect(out?.authorAvatarId).toBe(PLATFORM_ATTRIBUTION_AVATAR_ID);
    expect(out?.post.content).toContain("foo");
  });

  it("falls back to first system avatar when the tag is unclaimed", () => {
    const cat = [mk("backup", ["system"])];
    const out = buildUnclaimedContractsWarning({
      catalog: cat,
      unclaimed: ["x"],
      duplicate: ["y"],
    });
    expect(out?.authorAvatarId).toBe("backup");
    expect(out?.post.content).toContain("x");
    expect(out?.post.content).toContain("y");
  });

  it("returns null when no system avatars exist at all", () => {
    const cat = [mk("plain")];
    const out = buildUnclaimedContractsWarning({
      catalog: cat,
      unclaimed: ["x"],
      duplicate: [],
    });
    expect(out).toBeNull();
  });
});
