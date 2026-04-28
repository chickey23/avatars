import { beforeEach, describe, expect, it } from "vitest";
import type { Avatar, ConversationMessage } from "../../types";
import {
  __resetPlatformStoreForTests,
  getPlatformStore,
  ensurePlatformStoreLoadedSync,
} from "../platform/store";
import {
  __resetMonitorsForTests,
  pollAll,
  registerMonitor,
} from "./registry";
import {
  __resetSyntheticPostForTests,
  postMonitorPost,
  setSyntheticPostSink,
} from "./postSynthetic";
import {
  __resetSyntheticActionsForTests,
  runSyntheticAction,
} from "./actions";
import {
  COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID,
  COMPLEX_TASK_PLANNER_MONITOR_NAME,
  complexTaskPlannerMonitor,
} from "./complexTaskPlanner";

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

describe("complexTaskPlannerMonitor", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.clear();
    __resetPlatformStoreForTests();
    ensurePlatformStoreLoadedSync();
    __resetMonitorsForTests();
    __resetSyntheticPostForTests();
    __resetSyntheticActionsForTests();
  });

  it("posts a review card for a named avatar creation request", async () => {
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars named Alice, Bob, and Carol",
        timestamp: 1,
      },
    });

    expect(result.postsByMonitor).toHaveLength(1);
    const post = result.postsByMonitor[0]!.posts[0]!;
    expect(post.content).toContain("Alice, Bob, Carol");
    expect(post.actions?.map((a) => a.label)).toContain("Create tasks");
  });

  it("uses the fallback avatar when no catalog row claims the monitor tag", async () => {
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [mk(COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID, ["system"])];

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars named Alice and Bob",
        timestamp: 1,
      },
    });

    const post = result.postsByMonitor[0]!.posts[0]!;
    expect(post.avatarId).toBe(COMPLEX_TASK_PLANNER_FALLBACK_AVATAR_ID);
    expect(result.unclaimed).toEqual([]);
  });

  it("creates one project and one task per named avatar when accepted", async () => {
    registerMonitor(complexTaskPlannerMonitor);
    const catalog = [
      mk("creator", ["system", `monitor:${COMPLEX_TASK_PLANNER_MONITOR_NAME}`]),
    ];
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const result = await pollAll("user_turn", catalog, {
      latestUserMessage: {
        id: "u1",
        content: "Create avatars named Alice, Bob, and Carol",
        timestamp: 1,
      },
    });
    postMonitorPost(result.postsByMonitor[0]!.posts[0]!, COMPLEX_TASK_PLANNER_MONITOR_NAME);
    const prompt = posted[0]!;
    const action = prompt.syntheticActions!.find((a) =>
      a.id.startsWith("create_avatar_tasks:")
    )!;

    await runSyntheticAction(prompt, action);

    const store = getPlatformStore();
    const projects = Object.values(store.projects);
    const tasks = Object.values(store.tasks);
    expect(projects).toHaveLength(1);
    expect(tasks.map((t) => t.title).sort()).toEqual([
      "Create avatar: Alice",
      "Create avatar: Bob",
      "Create avatar: Carol",
    ]);
    expect(tasks.every((t) => t.requiredCapability?.id === "avatar_creation")).toBe(
      true
    );
    expect(tasks.every((t) => t.notes?.includes("seedText:"))).toBe(true);
    expect(tasks.every((t) => t.notes?.includes("wikiQuery:"))).toBe(true);
    expect(posted.at(-1)?.content).toContain("Created");
  });
});
