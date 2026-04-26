import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assignTask, loadTasks } from "./longTermTasks";
import {
  __resetPlatformStoreForTests,
  ensurePlatformStoreLoadedSync,
  getPlatformStore,
  updateTaskWorkflow,
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
      workflowStatus: "blocked",
      nextActor: "user",
      requiredCapability: {
        id: "source.sms",
        kind: "source",
        reason: "Needs private messages for this step.",
      },
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
    expect(synced.workflowStatus).toBe("blocked");
    expect(synced.nextActor).toBe("user");
    expect(synced.requiredCapability?.id).toBe("source.sms");
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

  it("preserves platform task workflow fields when world metadata edits sync", () => {
    patchWorldMetadataProjectsForExecution({
      p1: { title: "Alpha", summary: "First", updatedAt: 1 },
    });
    const platformTask = upsertTask({
      projectId: "p1",
      title: "Investigate",
      actor: "user",
      ownerAvatarId: "muse",
    });
    updateTaskWorkflow({
      taskId: platformTask.id,
      actor: "muse",
      workflowStatus: "waiting_for_user",
      nextActor: "user",
      blockers: [
        {
          id: "blocker_1",
          title: "Needs confirmation",
          createdAt: 1,
          createdBy: "muse",
        },
      ],
    });

    patchWorldMetadataProjectsForExecution({
      p1: { title: "Beta", summary: "Updated", updatedAt: 2 },
    });

    const synced = getPlatformStore().tasks[platformTask.id]!;
    expect(synced.workflowStatus).toBe("waiting_for_user");
    expect(synced.nextActor).toBe("user");
    expect(synced.blockers?.[0]?.title).toBe("Needs confirmation");
  });
});
