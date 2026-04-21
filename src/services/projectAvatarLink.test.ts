import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ensureProjectTaskForAvatar } from "./projectAvatarLink";
import * as store from "./worldMetadata/store";
import * as lt from "./longTermTasks";

describe("ensureProjectTaskForAvatar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
    vi.stubGlobal("window", { dispatchEvent: vi.fn() } as unknown as Window);
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
  });
});
