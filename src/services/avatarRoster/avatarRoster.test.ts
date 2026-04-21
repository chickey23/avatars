import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { createEmptyContext } from "../situationContext";
import type { SituationContext } from "../../types";
import { defaultAvatars } from "../../data/defaultAvatars";
import {
  applyScoreDeltaWithCap,
  applyUnhelpfulDecrement,
  getRosterScore,
  scoresFromCoreOrder,
  sortAvatarsByRosterScore,
} from "./index";
import { resolveExecutorAvatarId } from "./executor";
import { listPopInAvatarIdsForProjectFocus, mergePopInIntoResponderIds } from "./popIn";
import { saveTasks, type LongTermTask } from "../longTermTasks";

const lsStore = new Map<string, string>();

describe("avatarRoster", () => {
  beforeAll(() => {
    vi.stubGlobal(
      "localStorage",
      {
        get length() {
          return lsStore.size;
        },
        clear() {
          lsStore.clear();
        },
        getItem(k: string) {
          return lsStore.has(k) ? lsStore.get(k)! : null;
        },
        setItem(k: string, v: string) {
          lsStore.set(k, v);
        },
        removeItem(k: string) {
          lsStore.delete(k);
        },
        key() {
          return null;
        },
      } as Storage
    );
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });
  it("sortAvatarsByRosterScore breaks ties by id", () => {
    const scores = { a: 50, b: 50, c: 50 };
    const avatars = [
      { id: "c", givenName: "C" } as (typeof defaultAvatars)[0],
      { id: "a", givenName: "A" } as (typeof defaultAvatars)[0],
      { id: "b", givenName: "B" } as (typeof defaultAvatars)[0],
    ];
    const sorted = sortAvatarsByRosterScore(avatars, scores);
    expect(sorted.map((x) => x.id).join(",")).toBe("a,b,c");
  });

  it("applyScoreDeltaWithCap deflates others when exceeding max", () => {
    const ids = ["a", "b", "c"];
    const start = { a: 100, b: 50, c: 0 };
    const next = applyScoreDeltaWithCap(start, "b", 60, ids);
    expect(getRosterScore(next, "c")).toBe(0);
    expect(getRosterScore(next, "a")).toBeLessThan(100);
    expect(getRosterScore(next, "b")).toBe(100);
  });

  it("applyUnhelpfulDecrement clamps at zero", () => {
    const ids = ["x"];
    const next = applyUnhelpfulDecrement({ x: 1 }, "x", ids);
    expect(next.x).toBe(0);
  });

  it("scoresFromCoreOrder assigns descending scores for core order", () => {
    const ids = ["a", "b", "c"];
    const next = scoresFromCoreOrder({}, ["b", "a", "c"], ids);
    expect(next.b).toBeGreaterThan(next.a);
    expect(next.a).toBeGreaterThan(next.c);
  });

  it("resolveExecutorAvatarId prefers valid override", () => {
    const ctx: SituationContext = {
      ...createEmptyContext(),
      primaryAvatarSlotCount: 2,
      executorOverrideAvatarId: "skeptic",
      avatarRosterPriorityScoreById: {
        muse: 100,
        accomplice: 50,
        skeptic: 1,
      },
    };
    expect(resolveExecutorAvatarId(ctx)).toBe("skeptic");
  });

  it("resolveExecutorAvatarId falls back to first core", () => {
    const ctx: SituationContext = {
      ...createEmptyContext(),
      primaryAvatarSlotCount: 2,
      avatarRosterPriorityScoreById: {
        muse: 10,
        accomplice: 90,
        skeptic: 50,
      },
    };
    expect(resolveExecutorAvatarId(ctx)).toBe("accomplice");
  });

  it("resolveExecutorAvatarId prefers first preferredOrder id in catalog over first core", () => {
    const ctx: SituationContext = {
      ...createEmptyContext(),
      primaryAvatarSlotCount: 3,
      avatarRosterPriorityScoreById: {
        muse: 100,
        accomplice: 50,
        skeptic: 10,
      },
    };
    expect(resolveExecutorAvatarId(ctx, ["skeptic"])).toBe("skeptic");
  });

  it("listPopInAvatarIdsForProjectFocus lists active task avatars", () => {
    const tasks: LongTermTask[] = [
      {
        id: "t1",
        avatarId: "muse",
        title: "x",
        status: "active",
        projectId: "proj1",
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    saveTasks(tasks);
    expect(listPopInAvatarIdsForProjectFocus("proj1")).toEqual(["muse"]);
  });

  it("mergePopInIntoResponderIds appends without duplicates", () => {
    saveTasks([
      {
        id: "t1",
        avatarId: "skeptic",
        title: "x",
        status: "active",
        projectId: "p2",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const ctx: SituationContext = {
      ...createEmptyContext(),
      userFocus: { project: { id: "p2", title: "P" } },
    };
    expect(mergePopInIntoResponderIds(["muse", "accomplice"], ctx)).toEqual([
      "muse",
      "accomplice",
      "skeptic",
    ]);
  });

  beforeEach(() => {
    lsStore.clear();
    saveTasks([]);
  });
});
