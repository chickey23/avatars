import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformStoreForTests,
  deleteProject,
  deleteTask,
  ensurePlatformStoreLoadedSync,
  getPlatformStore,
  migrateProjectsFromWorldMetadata,
  syncWorldMetadataProjectsAdditive,
  upsertProject,
  upsertTask,
} from "./store";
import { PLATFORM_ATTRIBUTION_AVATAR_ID, PLATFORM_STORE_STORAGE_KEY } from "./constants";

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

describe("platform store", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    __resetPlatformStoreForTests();
    localStorage.removeItem(PLATFORM_STORE_STORAGE_KEY);
    ensurePlatformStoreLoadedSync();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("upserts a project with author and history", () => {
    const rec = upsertProject({ title: "Garden", actor: "user" });
    expect(rec.authorUserId).toBe("user");
    expect(rec.status).toBe("active");
    const latest = rec.history[rec.history.length - 1];
    expect(latest?.kind).toBe("created");
    expect(latest?.actor).toBe("user");
  });

  it("records status and owner changes in history", () => {
    const created = upsertProject({ title: "Garden", actor: "user" });
    const updated = upsertProject({
      id: created.id,
      title: "Garden",
      status: "paused",
      ownerAvatarId: "muse",
      actor: "user",
    });
    expect(updated.status).toBe("paused");
    expect(updated.ownerAvatarId).toBe("muse");
    const kinds = updated.history.map((h) => h.kind);
    expect(kinds).toContain("status_change");
    expect(kinds).toContain("owner_change");
  });

  it("refuses platform attribution id as owner of projects or tasks", () => {
    expect(() =>
      upsertProject({
        title: "x",
        actor: "user",
        ownerAvatarId: PLATFORM_ATTRIBUTION_AVATAR_ID,
      })
    ).toThrow();
    const p = upsertProject({ title: "ok", actor: "user" });
    expect(() =>
      upsertTask({
        projectId: p.id,
        title: "t",
        actor: "user",
        ownerAvatarId: PLATFORM_ATTRIBUTION_AVATAR_ID,
      })
    ).toThrow();
  });

  it("cascades task deletion when a project is deleted", () => {
    const p = upsertProject({ title: "p", actor: "user" });
    const t = upsertTask({ projectId: p.id, title: "t", actor: "user" });
    expect(getPlatformStore().tasks[t.id]).toBeDefined();
    deleteProject(p.id, "user");
    expect(getPlatformStore().projects[p.id]).toBeUndefined();
    expect(getPlatformStore().tasks[t.id]).toBeUndefined();
  });

  it("delete task leaves project intact", () => {
    const p = upsertProject({ title: "p", actor: "user" });
    const t = upsertTask({ projectId: p.id, title: "t", actor: "user" });
    deleteTask(t.id, "user");
    expect(getPlatformStore().projects[p.id]).toBeDefined();
    expect(getPlatformStore().tasks[t.id]).toBeUndefined();
  });

  it("migrates world_metadata projects once, then is idempotent", () => {
    const world = {
      proj_a: { title: "Alpha", summary: "s1", updatedAt: 100 },
      proj_b: { title: "Beta", updatedAt: 200 },
    };
    const first = migrateProjectsFromWorldMetadata(world);
    expect(first.imported).toBe(2);
    const ids = Object.keys(getPlatformStore().projects);
    expect(ids.sort()).toEqual(["proj_a", "proj_b"]);
    const migrated = getPlatformStore().projects.proj_a!;
    expect(migrated.history[migrated.history.length - 1]?.kind).toBe("migration");
    expect(migrated.status).toBe("active");

    const second = migrateProjectsFromWorldMetadata(world);
    expect(second.imported).toBe(0);
  });

  it("startup sync refreshes world-authored fields while preserving lifecycle", () => {
    upsertProject({
      id: "proj_a",
      title: "Old",
      summary: "old summary",
      status: "paused",
      ownerAvatarId: "muse",
      dueAt: 99,
      actor: "user",
    });

    const result = syncWorldMetadataProjectsAdditive({
      proj_a: { title: "New", updatedAt: 100 },
      proj_b: { title: "Added", summary: "new row", updatedAt: 200 },
    });

    expect(result).toEqual({ added: 1, updated: 1 });
    const synced = getPlatformStore().projects.proj_a!;
    expect(synced).toMatchObject({
      title: "New",
      status: "paused",
      ownerAvatarId: "muse",
      dueAt: 99,
    });
    expect(synced.summary).toBeUndefined();
    expect(getPlatformStore().projects.proj_b?.summary).toBe("new row");
  });
});
