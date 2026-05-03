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
  selectNextQueuedAvatarCreationTaskForProject,
} from "./avatarCreationTaskExecution";
import {
  __resetAvatarCatalogAccessorForTests,
  setAvatarCatalogAccessor,
} from "./avatarCreationRouting";
import type { Avatar, ConversationMessage } from "../types";

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
    __resetAvatarCatalogAccessorForTests();
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
    expect(posted[0]?.avatarId).toBe("blessed_exchequer");
    const updated = getPlatformStore().tasks[task.id]!;
    expect(updated.workflowStatus).toBe("waiting_for_user");
    expect(updated.nextActor).toBe("user");
  });

  it("posts the offer as a non-system tool_owner:avatar_creation steward when set", () => {
    const workshopSteward: Avatar = {
      id: "workshop_steward_x",
      processName: "workshop_steward_x",
      givenName: "WS",
      appellation: "Steward",
      description: "",
      tags: [],
      personality: "",
      interests: [],
      assignedTasks: [],
      opinions: {},
      systemTags: ["tool_owner:avatar_creation"],
    } as Avatar;
    setAvatarCatalogAccessor(() => [workshopSteward]);

    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));
    const project = upsertProject({ title: "Create avatars", actor: "test" });
    const task = upsertTask({
      projectId: project.id,
      title: "Create avatar: Bob",
      notes: "- seedText: Create Bob\n- wikiQuery: Bob",
      actor: "test",
      workflowStatus: "open",
      requiredCapability: {
        id: "avatar_creation",
        kind: "tool",
        label: "Avatar creation",
      },
    });

    expect(executeAvatarCreationTask(task)).toBe(true);
    expect(posted[0]?.avatarId).toBe("workshop_steward_x");
    expect(getPlatformStore().tasks[task.id]!.history.at(-1)?.actor).toBe(
      "workshop_steward_x"
    );
  });

  it("uses task.ownerAvatarId when set to a non-system avatar", () => {
    setAvatarCatalogAccessor(() => []);

    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));
    const project = upsertProject({ title: "Create avatars", actor: "test" });
    const task = upsertTask({
      projectId: project.id,
      title: "Create avatar: Carol",
      notes: "- seedText: Create Carol\n- wikiQuery: Carol",
      actor: "test",
      ownerAvatarId: "user_owned_steward",
      workflowStatus: "open",
      requiredCapability: {
        id: "avatar_creation",
        kind: "tool",
        label: "Avatar creation",
      },
    });

    expect(executeAvatarCreationTask(task)).toBe(true);
    expect(posted[0]?.avatarId).toBe("user_owned_steward");
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

  it("selectNextQueuedAvatarCreationTaskForProject ignores other projects", () => {
    const hints = "- seedText: S\n- wikiQuery: W";
    const p1 = upsertProject({ title: "P1", actor: "test" });
    const p2 = upsertProject({ title: "P2", actor: "test" });
    const t1 = upsertTask({
      projectId: p1.id,
      title: "Only P1",
      notes: hints,
      actor: "test",
      workflowStatus: "open",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });
    upsertTask({
      projectId: p2.id,
      title: "Only P2",
      notes: hints,
      actor: "test",
      workflowStatus: "open",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });

    const store = getPlatformStore();
    expect(selectNextQueuedAvatarCreationTask(store)?.id).toBe(t1.id);
    expect(selectNextQueuedAvatarCreationTaskForProject(store, p2.id)?.title).toBe(
      "Only P2"
    );
    expect(selectNextQueuedAvatarCreationTaskForProject(store, p1.id)?.id).toBe(t1.id);
  });
});
