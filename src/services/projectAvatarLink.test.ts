import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  beforeAll,
  afterAll,
} from "vitest";
import { __resetPlatformStoreForTests } from "./platform/store";
import { ensureProjectTaskForAvatar } from "./projectAvatarLink";
import * as store from "./worldMetadata/store";
import * as lt from "./longTermTasks";

const lsStore = new Map<string, string>();

describe("ensureProjectTaskForAvatar", () => {
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
    vi.restoreAllMocks();
  });

  it("assigns a new task and dispatches when project exists", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal(
      "window",
      { dispatchEvent } as unknown as Window & typeof globalThis
    );
    vi.spyOn(store, "getWorldMetadata").mockReturnValue({
      schemaVersion: 2,
      people: {},
      projects: {
        p1: { title: "Hello", updatedAt: 1 },
      },
      userProfile: { updatedAt: 1 },
    });
    const assignSpy = vi.spyOn(lt, "assignTask").mockReturnValue({
      id: "task-new",
      avatarId: "muse",
      title: "Hello",
      projectId: "p1",
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    vi.spyOn(lt, "loadTasks").mockReturnValue([]);

    ensureProjectTaskForAvatar("muse", "p1");

    expect(assignSpy).toHaveBeenCalledWith("muse", "Hello", undefined, "p1");
    expect(dispatchEvent).toHaveBeenCalled();
  });

  it("does not assign when an active task already exists", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal(
      "window",
      { dispatchEvent } as unknown as Window & typeof globalThis
    );
    vi.spyOn(store, "getWorldMetadata").mockReturnValue({
      schemaVersion: 2,
      people: {},
      projects: {
        p1: { title: "Hello", updatedAt: 1 },
      },
      userProfile: { updatedAt: 1 },
    });
    vi.spyOn(lt, "loadTasks").mockReturnValue([
      {
        id: "existing",
        avatarId: "muse",
        title: "Hello",
        projectId: "p1",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const assignSpy = vi.spyOn(lt, "assignTask");

    ensureProjectTaskForAvatar("muse", "p1");

    expect(assignSpy).not.toHaveBeenCalled();
    expect(dispatchEvent).toHaveBeenCalled();
  });
});
