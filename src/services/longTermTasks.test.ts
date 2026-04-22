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
  loadTasks,
} from "./longTermTasks";

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
});
