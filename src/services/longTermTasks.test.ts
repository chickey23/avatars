import {
  describe,
  it,
  expect,
  beforeEach,
  beforeAll,
  afterAll,
  vi,
} from "vitest";
import {
  activeProjectIdsFromLongTermTasks,
  assignTask,
  completeActiveTasksForProjectExcept,
  dedupeActiveTasksForAvatarProject,
  getProjectAssignmentsForAvatar,
  loadTasks,
} from "./longTermTasks";
import {
  __resetPlatformStoreForTests,
  ensurePlatformStoreLoadedSync,
  upsertProject,
} from "./platform/store";

const lsStore = new Map<string, string>();

describe("longTermTasks stewardship helpers", () => {
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

  beforeEach(() => {
    lsStore.clear();
    __resetPlatformStoreForTests();
    ensurePlatformStoreLoadedSync();
  });

  it("activeProjectIdsFromLongTermTasks collects active rows with projectId", () => {
    assignTask("muse", "A", undefined, "p1");
    assignTask("muse", "B", undefined, "p2");
    expect(activeProjectIdsFromLongTermTasks()).toEqual(
      new Set(["p1", "p2"])
    );
  });

  it("completeActiveTasksForProjectExcept completes other avatars only", () => {
    assignTask("muse", "A", undefined, "p1");
    assignTask("accomplice", "B", undefined, "p1");
    completeActiveTasksForProjectExcept("p1", "muse");
    const tasks = loadTasks();
    expect(tasks.filter((t) => t.status === "active")).toHaveLength(1);
    expect(tasks.find((t) => t.status === "active")?.avatarId).toBe("muse");
  });

  it("dedupeActiveTasksForAvatarProject keeps the most recently updated", () => {
    const t1 = assignTask("muse", "A", undefined, "p1");
    const t2 = assignTask("muse", "B", undefined, "p1");
    const tasks = loadTasks();
    const row1 = tasks.find((t) => t.id === t1.id)!;
    const row2 = tasks.find((t) => t.id === t2.id)!;
    row1.updatedAt = 10;
    row2.updatedAt = 20;
    localStorage.setItem("avatars_long_term_tasks", JSON.stringify(tasks));
    dedupeActiveTasksForAvatarProject("muse", "p1");
    const after = loadTasks().filter((t) => t.status === "active");
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(t2.id);
  });

  it("lists unique assigned projects from avatar id and persisted assigned task ids", () => {
    const t1 = assignTask("muse", "Alpha old", undefined, "p1");
    const t2 = assignTask("muse", "Alpha new", undefined, "p1");
    const t3 = assignTask("other", "Beta", undefined, "p2");
    const tasks = loadTasks();
    tasks.find((t) => t.id === t1.id)!.updatedAt = 10;
    tasks.find((t) => t.id === t2.id)!.updatedAt = 20;
    tasks.find((t) => t.id === t3.id)!.updatedAt = 30;
    localStorage.setItem("avatars_long_term_tasks", JSON.stringify(tasks));

    const assignments = getProjectAssignmentsForAvatar("muse", [t3.id]);

    expect(assignments.map((t) => t.projectId)).toEqual(["p1", "p2"]);
    expect(assignments.find((t) => t.projectId === "p1")?.id).toBe(t2.id);
  });

  it("includes active platform projects stewarded by the avatar", () => {
    upsertProject({
      id: "p1",
      title: "Tool-created project",
      summary: "Visible from platform ownership.",
      ownerAvatarId: "muse",
      actor: "muse",
    });

    const assignments = getProjectAssignmentsForAvatar("muse");

    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      avatarId: "muse",
      title: "Tool-created project",
      description: "Visible from platform ownership.",
      projectId: "p1",
      status: "active",
    });
  });

  it("excludes done and archived platform projects from assignments", () => {
    upsertProject({
      id: "active_project",
      title: "Active project",
      ownerAvatarId: "muse",
      actor: "muse",
    });
    upsertProject({
      id: "done_project",
      title: "Done project",
      ownerAvatarId: "muse",
      status: "done",
      actor: "muse",
    });
    upsertProject({
      id: "archived_project",
      title: "Archived project",
      ownerAvatarId: "muse",
      status: "archived",
      actor: "muse",
    });

    const assignments = getProjectAssignmentsForAvatar("muse");
    expect(assignments.map((t) => t.projectId)).toEqual(["active_project"]);
  });
});
