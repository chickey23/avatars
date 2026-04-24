import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignTask, loadTasks } from "./longTermTasks";
import {
  __resetPlatformStoreForTests,
  ensurePlatformStoreLoadedSync,
  getPlatformStore,
  upsertProject,
  upsertTask,
} from "./platform/store";
import { PLATFORM_STORE_STORAGE_KEY } from "./platform/constants";
import { patchWorldMetadataProjectsForExecution } from "./projectSync";
import { __resetWorldMetadataForTests } from "./worldMetadata/store";

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

describe("project execution sync", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    __resetWorldMetadataForTests();
    __resetPlatformStoreForTests();
    localStorage.removeItem(PLATFORM_STORE_STORAGE_KEY);
    ensurePlatformStoreLoadedSync();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mirrors project creates and edits while preserving platform lifecycle", () => {
    patchWorldMetadataProjectsForExecution({
      p1: { title: "Alpha", summary: "First", updatedAt: 1 },
    });
    upsertProject({
      id: "p1",
      title: "Alpha",
      summary: "First",
      status: "paused",
      ownerAvatarId: "muse",
      dueAt: 42,
      actor: "user",
    });

    patchWorldMetadataProjectsForExecution({
      p1: { title: "Beta", summary: undefined, notes: "New notes", updatedAt: 2 },
    });

    const synced = getPlatformStore().projects.p1!;
    expect(synced.title).toBe("Beta");
    expect(synced.summary).toBeUndefined();
    expect(synced.status).toBe("paused");
    expect(synced.ownerAvatarId).toBe("muse");
    expect(synced.dueAt).toBe(42);
  });

  it("keeps unresolved avatar tasks aligned with project edits", () => {
    patchWorldMetadataProjectsForExecution({
      p1: { title: "Alpha", summary: "First", updatedAt: 1 },
    });
    const task = assignTask("muse", "Alpha", "First", "p1");

    patchWorldMetadataProjectsForExecution({
      p1: { title: "Beta", notes: "New notes", updatedAt: 2 },
    });

    const updated = loadTasks().find((t) => t.id === task.id)!;
    expect(updated.title).toBe("Beta");
    expect(updated.description).toBe("New notes");
    expect(updated.status).toBe("active");
  });

  it("deletes platform state and completes long-term tasks for removed projects", () => {
    patchWorldMetadataProjectsForExecution({
      p1: { title: "Alpha", summary: "First", updatedAt: 1 },
    });
    const platformTask = upsertTask({
      projectId: "p1",
      title: "Platform task",
      actor: "user",
    });
    const longTermTask = assignTask("muse", "Alpha", "First", "p1");

    patchWorldMetadataProjectsForExecution({ p1: null });

    expect(getPlatformStore().projects.p1).toBeUndefined();
    expect(getPlatformStore().tasks[platformTask.id]).toBeUndefined();
    const completed = loadTasks().find((t) => t.id === longTermTask.id)!;
    expect(completed.status).toBe("completed");
  });
});
