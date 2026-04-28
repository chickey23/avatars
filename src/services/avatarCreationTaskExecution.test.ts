import { beforeEach, describe, expect, it } from "vitest";
import {
  __resetPlatformStoreForTests,
  ensurePlatformStoreLoadedSync,
  getPlatformStore,
  updateTaskWorkflow,
  upsertProject,
  upsertTask,
} from "./platform/store";
import {
  __resetSyntheticPostForTests,
  setSyntheticPostSink,
} from "./monitors/postSynthetic";
import {
  advanceAvatarCreationTaskQueue,
  executeAvatarCreationTask,
  extractAvatarCreationTaskHints,
  selectNextQueuedAvatarCreationTask,
} from "./avatarCreationTaskExecution";
import type { ConversationMessage } from "../types";

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

describe("avatarCreationTaskExecution", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.clear();
    __resetPlatformStoreForTests();
    __resetSyntheticPostForTests();
    ensurePlatformStoreLoadedSync();
  });

  it("extracts seeded avatar-creation hints from task notes", () => {
    expect(
      extractAvatarCreationTaskHints(
        [
          "Create a named avatar for Alice.",
          "",
          "Avatar creation workshop hints:",
          "- seedText: Create a named avatar for Alice.",
          "- wikiQuery: Alice",
        ].join("\n")
      )
    ).toEqual({
      seedText: "Create a named avatar for Alice.",
      wikiQuery: "Alice",
    });
  });

  it("posts an offer and marks avatar-creation task waiting for user", () => {
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));
    const project = upsertProject({ title: "Create avatars", actor: "test" });
    const task = upsertTask({
      projectId: project.id,
      title: "Create avatar: Alice",
      notes: "- seedText: Create Alice\n- wikiQuery: Alice",
      actor: "test",
      workflowStatus: "open",
      requiredCapability: {
        id: "avatar_creation",
        kind: "tool",
        label: "Avatar creation",
      },
    });

    expect(executeAvatarCreationTask(task)).toBe(true);

    expect(posted[0]?.content).toContain("I prepared an avatar creation draft");
    const updated = getPlatformStore().tasks[task.id]!;
    expect(updated.workflowStatus).toBe("waiting_for_user");
    expect(updated.nextActor).toBe("user");
  });

  it("selectNextQueued skips a project while another task waits for user", () => {
    const project = upsertProject({ title: "Multi", actor: "test" });
    const hints = "- seedText: Seed\n- wikiQuery: Wiki";
    const t1 = upsertTask({
      projectId: project.id,
      title: "Avatar A",
      notes: hints,
      actor: "test",
      workflowStatus: "open",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });
    const t2 = upsertTask({
      projectId: project.id,
      title: "Avatar B",
      notes: hints,
      actor: "test",
      workflowStatus: "open",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });

    updateTaskWorkflow({
      taskId: t1.id,
      actor: "test",
      workflowStatus: "waiting_for_user",
      nextActor: "user",
      detail: "test hold",
    });

    expect(selectNextQueuedAvatarCreationTask(getPlatformStore())?.id).toBe(undefined);

    updateTaskWorkflow({
      taskId: t1.id,
      actor: "test",
      workflowStatus: "cancelled",
      nextActor: null,
      detail: "test cleanup",
    });

    expect(selectNextQueuedAvatarCreationTask(getPlatformStore())?.id).toBe(t2.id);
  });

  it("advanceAvatarCreationTaskQueue advances after the active task clears", () => {
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const project = upsertProject({ title: "Fifo", actor: "test" });
    const hints = "- seedText: S\n- wikiQuery: W";
    const first = upsertTask({
      projectId: project.id,
      title: "First",
      notes: hints,
      actor: "test",
      workflowStatus: "open",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });
    upsertTask({
      projectId: project.id,
      title: "Second",
      notes: hints,
      actor: "test",
      workflowStatus: "open",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });

    expect(advanceAvatarCreationTaskQueue()).toBe(true);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.content).toContain("First");

    expect(advanceAvatarCreationTaskQueue()).toBe(false);
    expect(posted).toHaveLength(1);

    updateTaskWorkflow({
      taskId: first.id,
      actor: "test",
      workflowStatus: "cancelled",
      nextActor: null,
      detail: "test cancel",
    });

    expect(advanceAvatarCreationTaskQueue()).toBe(true);
    expect(posted).toHaveLength(2);
    expect(posted[1]?.content).toContain("Second");
  });
});
