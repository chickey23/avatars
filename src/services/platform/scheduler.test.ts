import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformStoreForTests,
  ensurePlatformStoreLoadedSync,
  upsertProject,
  upsertTask,
} from "./store";
import { startPlatformScheduler, type SchedulerFireEvent } from "./scheduler";
import { PLATFORM_STORE_STORAGE_KEY } from "./constants";

function installMemoryLocalStorage(): void {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  } as Storage);
}

describe("platform scheduler", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    __resetPlatformStoreForTests();
    localStorage.removeItem(PLATFORM_STORE_STORAGE_KEY);
    ensurePlatformStoreLoadedSync();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fires for an overdue task owned by an avatar", () => {
    const p = upsertProject({
      title: "Project",
      actor: "user",
      ownerAvatarId: "muse",
    });
    upsertTask({
      projectId: p.id,
      title: "Overdue thing",
      actor: "user",
      ownerAvatarId: "muse",
      dueAt: 1000,
    });
    const fires: SchedulerFireEvent[] = [];
    const handle = startPlatformScheduler({
      intervalMs: 10_000_000,
      now: () => 2000,
      onFire: (e) => fires.push(e),
    });
    expect(fires.length).toBe(1);
    expect(fires[0]!.ownerAvatarId).toBe("muse");
    expect(fires[0]!.itemKind).toBe("task");
    expect(fires[0]!.reason).toBe("due");
    expect(fires[0]!.sourceRef.kind).toBe("task");
    handle.stop();
  });

  it("does not fire for owner-less items", () => {
    const p = upsertProject({ title: "Project", actor: "user" });
    upsertTask({
      projectId: p.id,
      title: "Orphan",
      actor: "user",
      dueAt: 1000,
    });
    const fires: SchedulerFireEvent[] = [];
    const handle = startPlatformScheduler({
      intervalMs: 10_000_000,
      now: () => 2000,
      onFire: (e) => fires.push(e),
    });
    expect(fires.length).toBe(0);
    handle.stop();
  });

  it("does not fire for resolved items", () => {
    const p = upsertProject({
      title: "done-project",
      actor: "user",
      ownerAvatarId: "muse",
      status: "done",
      dueAt: 1,
    });
    expect(p.status).toBe("done");
    const fires: SchedulerFireEvent[] = [];
    const handle = startPlatformScheduler({
      intervalMs: 10_000_000,
      now: () => 2000,
      onFire: (e) => fires.push(e),
    });
    expect(fires.length).toBe(0);
    handle.stop();
  });

  it("de-duplicates repeated fires for the same (item, reason, dueAt)", () => {
    const p = upsertProject({
      title: "Project",
      actor: "user",
      ownerAvatarId: "muse",
      dueAt: 1000,
    });
    expect(p.dueAt).toBe(1000);
    const fires: SchedulerFireEvent[] = [];
    const handle = startPlatformScheduler({
      intervalMs: 10_000_000,
      now: () => 5000,
      onFire: (e) => fires.push(e),
    });
    handle.scanNow();
    handle.scanNow();
    expect(fires.length).toBe(1);
    handle.stop();
  });

  it("refires when dueAt changes", () => {
    const p = upsertProject({
      title: "Project",
      actor: "user",
      ownerAvatarId: "muse",
      dueAt: 1000,
    });
    const fires: SchedulerFireEvent[] = [];
    const handle = startPlatformScheduler({
      intervalMs: 10_000_000,
      now: () => 5000,
      onFire: (e) => fires.push(e),
    });
    upsertProject({ id: p.id, title: "Project", actor: "user", dueAt: 2000 });
    handle.scanNow();
    expect(fires.length).toBe(2);
    handle.stop();
  });
});
