import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformStoreForTests,
  createTaskBlocker,
  createTaskCompletionEvidence,
  deleteProject,
  deleteTask,
  ensurePlatformStoreLoadedSync,
  getPlatformStore,
  migrateProjectsFromWorldMetadata,
  syncWorldMetadataProjectsAdditive,
  updateTaskWorkflow,
  upsertProject,
  upsertTask,
} from "./store";
import {
  PLATFORM_ATTRIBUTION_AVATAR_ID,
  PLATFORM_STORE_SCHEMA_VERSION,
  PLATFORM_STORE_STORAGE_KEY,
} from "./constants";
import { subscribeSessionChangeDelta } from "../sessionChangeTelemetry";

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

  it("emits session delta only when project core fields change", () => {
    const created = upsertProject({ title: "CoreSig", actor: "user" });
    let total = 0;
    const unsub = subscribeSessionChangeDelta((d) => {
      total += d;
    });
    upsertProject({ id: created.id, title: "CoreSig", actor: "user" });
    expect(total).toBe(0);
    upsertProject({ id: created.id, title: "Renamed", actor: "user" });
    unsub();
    expect(total).toBe(1);
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

  it("auto-closes a project when all its tasks are resolved", () => {
    const p = upsertProject({ title: "Closable", actor: "user" });
    const t1 = upsertTask({ projectId: p.id, title: "Task A", actor: "user" });
    const t2 = upsertTask({ projectId: p.id, title: "Task B", actor: "user" });

    updateTaskWorkflow({ taskId: t1.id, actor: "user", workflowStatus: "done" });
    let project = getPlatformStore().projects[p.id]!;
    expect(project.status).toBe("active");
    expect(project.workflowStatus).toBe("open");

    updateTaskWorkflow({ taskId: t2.id, actor: "user", workflowStatus: "cancelled" });
    project = getPlatformStore().projects[p.id]!;
    expect(project.status).toBe("done");
    expect(project.workflowStatus).toBe("done");
  });

  it("reopens a done project when a new unresolved task is added", () => {
    const p = upsertProject({ title: "Reopenable", actor: "user" });
    const t1 = upsertTask({ projectId: p.id, title: "Task A", actor: "user" });
    updateTaskWorkflow({ taskId: t1.id, actor: "user", workflowStatus: "done" });
    let project = getPlatformStore().projects[p.id]!;
    expect(project.status).toBe("done");

    upsertTask({ projectId: p.id, title: "Task B", actor: "user" });
    project = getPlatformStore().projects[p.id]!;
    expect(project.status).toBe("active");
    expect(project.workflowStatus).toBe("open");
  });

  it("migrates v1 store docs to workflow-aware schema", () => {
    __resetPlatformStoreForTests();
    localStorage.setItem(
      PLATFORM_STORE_STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        projects: {
          p1: {
            id: "p1",
            title: "Legacy project",
            status: "active",
            authorUserId: "user",
            createdAt: 1,
            updatedAt: 1,
            history: [],
          },
        },
        tasks: {
          t1: {
            id: "t1",
            projectId: "p1",
            title: "Legacy done task",
            status: "done",
            createdAt: 1,
            updatedAt: 1,
            history: [],
          },
        },
        migrations: {},
      })
    );

    ensurePlatformStoreLoadedSync();

    const migrated = getPlatformStore();
    expect(migrated.schemaVersion).toBe(PLATFORM_STORE_SCHEMA_VERSION);
    expect(migrated.projects.p1?.workflowStatus).toBe("open");
    expect(migrated.tasks.t1?.workflowStatus).toBe("done");
  });

  it("updates workflow status, blockers, approvals, and completion evidence", () => {
    const p = upsertProject({ title: "Autonomous work", actor: "user" });
    const t = upsertTask({
      projectId: p.id,
      title: "Research source",
      actor: "user",
      ownerAvatarId: "muse",
    });
    const blocker = createTaskBlocker(
      "muse",
      "Missing SMS access",
      "Could proceed if text-message search existed."
    );

    const blocked = updateTaskWorkflow({
      taskId: t.id,
      actor: "muse",
      workflowStatus: "blocked",
      nextActor: "user",
      requiredCapability: {
        id: "source.sms",
        kind: "source",
        label: "Text messages",
      },
      approval: {
        policy: "user_approval_required",
        status: "pending",
        requestedAt: 123,
        requestedBy: "muse",
        rationale: "Needs user/private data access.",
      },
      blockers: [blocker],
    });

    expect(blocked.status).toBe("open");
    expect(blocked.workflowStatus).toBe("blocked");
    expect(blocked.nextActor).toBe("user");
    expect(blocked.requiredCapability?.id).toBe("source.sms");
    expect(blocked.approval?.status).toBe("pending");
    expect(blocked.blockers).toHaveLength(1);
    expect(blocked.history.map((h) => h.kind)).toEqual(
      expect.arrayContaining([
        "workflow_change",
        "approval_change",
        "blocker_change",
      ])
    );

    const evidence = createTaskCompletionEvidence(
      "muse",
      "User confirmed the research source is complete.",
      "chat:user-confirmation"
    );
    const done = updateTaskWorkflow({
      taskId: t.id,
      actor: "muse",
      workflowStatus: "done",
      nextActor: null,
      requiredCapability: null,
      approval: null,
      blockers: [],
      completionEvidence: [evidence],
    });

    expect(done.status).toBe("done");
    expect(done.workflowStatus).toBe("done");
    expect(done.nextActor).toBeUndefined();
    expect(done.requiredCapability).toBeUndefined();
    expect(done.approval).toBeUndefined();
    expect(done.completionEvidence?.[0]?.note).toContain("confirmed");
    expect(done.history.map((h) => h.kind)).toContain("completion_evidence");
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
