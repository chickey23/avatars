import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetPlatformStoreForTests,
  ensurePlatformStoreLoadedSync,
  getPlatformStore,
  upsertProject,
  upsertTask,
} from "./platform/store";
import { subscribePlatformEvents } from "./platform/bus";
import {
  expectedNameFromAvatarCreationTask,
  normalizeAvatarCreationTargetName,
  scanAvatarCreationTaskFulfillment,
} from "./avatarCreationTaskFulfillment";
import type { Avatar } from "../types";

function installMemoryLocalStorage(): void {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, String(value));
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
      clear: () => data.clear(),
    },
  });
}

describe("avatarCreationTaskFulfillment", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.clear();
    __resetPlatformStoreForTests();
    ensurePlatformStoreLoadedSync();
  });

  it("normalizes names for equality", () => {
    expect(normalizeAvatarCreationTargetName("  Alice  ")).toBe("alice");
  });

  it("reads expected name from wikiQuery or title", () => {
    const p = upsertProject({ title: "P", actor: "t" });
    const a = upsertTask({
      projectId: p.id,
      title: "Create avatar: Zora",
      notes: `- seedText: x\n- wikiQuery: Nora`,
      actor: "t",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });
    expect(expectedNameFromAvatarCreationTask(a)).toBe("Nora");

    const b = upsertTask({
      projectId: p.id,
      title: "Create avatar:  Lem",
      notes: `- seedText: only`,
      actor: "t",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });
    expect(expectedNameFromAvatarCreationTask(b)).toBe("Lem");
  });

  it("marks task done when a user avatar givenName matches", () => {
    const bus: unknown[] = [];
    const off = subscribePlatformEvents((e) => bus.push(e));

    const project = upsertProject({ title: "P", actor: "test" });
    const task = upsertTask({
      projectId: project.id,
      title: "Create avatar: Neo",
      notes: "- seedText: Seed\n- wikiQuery: Neo",
      actor: "test",
      workflowStatus: "waiting_for_user",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });

    const user: Avatar = {
      id: "user_neo",
      processName: "neo",
      givenName: "Neo",
      appellation: "Test",
      description: "",
      tags: [],
      personality: "",
      interests: [],
      assignedTasks: [],
      opinions: {},
    };

    expect(scanAvatarCreationTaskFulfillment([user])).toBe(1);
    off();

    const updated = getPlatformStore().tasks[task.id]!;
    expect(updated.workflowStatus).toBe("done");
    expect(updated.completionEvidence?.length).toBeGreaterThan(0);
    expect(bus).toEqual([
      {
        type: "avatar_creation_task_satisfied",
        taskId: task.id,
        matchedAvatarId: "user_neo",
      },
    ]);
  });

  it("does not complete when givenName differs", () => {
    const project = upsertProject({ title: "P", actor: "test" });
    upsertTask({
      projectId: project.id,
      title: "Create avatar: Trinity",
      notes: "- wikiQuery: Trinity",
      actor: "test",
      workflowStatus: "waiting_for_user",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });

    const user: Avatar = {
      id: "u1",
      processName: "t",
      givenName: "Trin",
      appellation: "",
      description: "",
      tags: [],
      personality: "",
      interests: [],
      assignedTasks: [],
      opinions: {},
    };

    expect(scanAvatarCreationTaskFulfillment([user])).toBe(0);
  });

  it("assigns one roster avatar to the first matching task when two tasks want the same name", () => {
    const project = upsertProject({ title: "P", actor: "test" });
    const t1 = upsertTask({
      projectId: project.id,
      title: "Create avatar: Sam",
      notes: "- wikiQuery: Sam",
      actor: "test",
      workflowStatus: "waiting_for_user",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });
    const t2 = upsertTask({
      projectId: project.id,
      title: "Create avatar: Sam",
      notes: "- wikiQuery: Sam",
      actor: "test",
      workflowStatus: "waiting_for_user",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });

    const user: Avatar = {
      id: "sam1",
      processName: "sam",
      givenName: "Sam",
      appellation: "",
      description: "",
      tags: [],
      personality: "",
      interests: [],
      assignedTasks: [],
      opinions: {},
    };

    expect(scanAvatarCreationTaskFulfillment([user])).toBe(1);
    expect(getPlatformStore().tasks[t1.id]?.workflowStatus).toBe("done");
    expect(getPlatformStore().tasks[t2.id]?.workflowStatus).toBe(
      "waiting_for_user"
    );
  });
});
