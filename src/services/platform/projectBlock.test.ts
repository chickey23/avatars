import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformStoreForTests,
  ensurePlatformStoreLoadedSync,
  upsertProject,
  upsertTask,
} from "./store";
import { platformFocusedProjectBlock } from "./projectBlock";
import { PLATFORM_STORE_STORAGE_KEY } from "./constants";

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

describe("platformFocusedProjectBlock", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    __resetPlatformStoreForTests();
    localStorage.removeItem(PLATFORM_STORE_STORAGE_KEY);
    ensurePlatformStoreLoadedSync();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns [] when no focus", () => {
    expect(platformFocusedProjectBlock(undefined)).toEqual([]);
    expect(platformFocusedProjectBlock({})).toEqual([]);
  });

  it("returns [] when focused project not in platform store", () => {
    expect(
      platformFocusedProjectBlock({ project: { id: "nope", title: "nope" } })
    ).toEqual([]);
  });

  it("emits status + steward + tasks for focused project", () => {
    const p = upsertProject({
      title: "Album",
      summary: "Cover art and mixing",
      actor: "user",
      ownerAvatarId: "muse",
      status: "active",
      dueAt: Date.UTC(2030, 0, 15, 12, 0, 0),
    });
    upsertTask({
      projectId: p.id,
      title: "Sketch cover",
      actor: "user",
      ownerAvatarId: "muse",
      workflowStatus: "blocked",
      nextActor: "user",
      requiredCapability: {
        id: "source.sms",
        kind: "source",
      },
      dueAt: Date.UTC(2030, 0, 10, 0, 0, 0),
    });
    upsertTask({
      projectId: p.id,
      title: "Done thing",
      actor: "user",
      status: "done",
    });

    const lines = platformFocusedProjectBlock({
      project: { id: p.id, title: p.title },
    });
    expect(lines[0]).toContain(p.id);
    expect(lines[0]).toContain('status=active');
    expect(lines.some((l) => l.includes("steward: muse"))).toBe(true);
    expect(lines.some((l) => l.includes("Cover art"))).toBe(true);
    expect(lines.some((l) => l.includes("Sketch cover"))).toBe(true);
    expect(lines.some((l) => l.includes("workflow=blocked"))).toBe(true);
    expect(lines.some((l) => l.includes("next=user"))).toBe(true);
    expect(lines.some((l) => l.includes("needs=source.sms"))).toBe(true);
  });
});
