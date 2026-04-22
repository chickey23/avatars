import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Avatar, ConversationMessage } from "../../types";
import {
  __resetPlatformStoreForTests,
  upsertProject,
} from "../platform/store";
import { setRoutingCatalogRef } from "../platform/routing";
import {
  __resetMonitorsForTests,
  registerMonitor,
  pollAll,
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
import * as lt from "../longTermTasks";
import {
  UNASSIGNED_PROJECT_MANAGER_AVATAR_ID,
  __resetUnassignedProjectsForTests,
  installUnassignedProjectsActions,
  unassignedProjectsMonitor,
} from "./unassignedProjects";

const mk = (id: string, systemTags?: string[], tags: string[] = []): Avatar =>
  ({
    id,
    processName: id,
    givenName: id,
    appellation: id,
    description: "",
    tags,
    personality: "",
    interests: [],
    assignedTasks: [],
    opinions: {},
    systemTags,
  }) as Avatar;

describe("unassignedProjectsMonitor", () => {
  beforeEach(() => {
    __resetPlatformStoreForTests();
    __resetMonitorsForTests();
    __resetSyntheticPostForTests();
    __resetSyntheticActionsForTests();
    __resetUnassignedProjectsForTests();
    installUnassignedProjectsActions();
  });

  it("emits no post when a project has only a long-term task (no owner yet)", async () => {
    const p = upsertProject({ title: "Stewarded via task", actor: "user" });
    const taskedSpy = vi
      .spyOn(lt, "activeProjectIdsFromLongTermTasks")
      .mockReturnValue(new Set([p.id]));
    try {
      registerMonitor(unassignedProjectsMonitor);
      const catalog = [
        mk("muse", undefined, ["creative"]),
        mk(UNASSIGNED_PROJECT_MANAGER_AVATAR_ID, [
          "system",
          "monitor:unassigned_projects",
        ]),
      ];
      setRoutingCatalogRef(catalog);
      const res = await pollAll("startup", catalog);
      expect(res.postsByMonitor).toEqual([]);
    } finally {
      taskedSpy.mockRestore();
    }
  });

  it("emits no post when every project has an owner", async () => {
    upsertProject({
      title: "Already owned",
      ownerAvatarId: "muse",
      actor: "user",
    });
    registerMonitor(unassignedProjectsMonitor);
    const catalog = [
      mk("muse", undefined, ["creative"]),
      mk(UNASSIGNED_PROJECT_MANAGER_AVATAR_ID, [
        "system",
        "monitor:unassigned_projects",
      ]),
    ];
    setRoutingCatalogRef(catalog);
    const res = await pollAll("startup", catalog);
    expect(res.postsByMonitor).toEqual([]);
    expect(res.unclaimed).toEqual([]);
  });

  it("emits one prompt when projects are unassigned", async () => {
    upsertProject({ title: "Lonely one", actor: "user" });
    upsertProject({ title: "Lonely two", actor: "user" });
    registerMonitor(unassignedProjectsMonitor);
    const catalog = [
      mk("muse", undefined, ["creative"]),
      mk(UNASSIGNED_PROJECT_MANAGER_AVATAR_ID, [
        "system",
        "monitor:unassigned_projects",
      ]),
    ];
    setRoutingCatalogRef(catalog);
    const res = await pollAll("startup", catalog);
    expect(res.postsByMonitor).toHaveLength(1);
    const posts = res.postsByMonitor[0]!.posts;
    expect(posts).toHaveLength(1);
    expect(posts[0]!.avatarId).toBe(UNASSIGNED_PROJECT_MANAGER_AVATAR_ID);
    expect(posts[0]!.content).toMatch(/2 projects/);
    const actionIds = posts[0]!.actions?.map((a) => a.id) ?? [];
    expect(actionIds).toContain("suggest_all");
    expect(actionIds).toContain("not_now");
  });

  it("suggest_all posts one follow-up per unassigned project with top-3 + skip", async () => {
    /** Arrange: two unassigned projects + three non-system avatars. */
    const p1 = upsertProject({ title: "Poetry workshop", actor: "user" });
    const p2 = upsertProject({ title: "Tactical strategy planner", actor: "user" });
    registerMonitor(unassignedProjectsMonitor);
    const catalog = [
      mk("muse", undefined, ["creative", "poetry", "imagination"]),
      mk("accomplice", undefined, ["action", "strategy", "tactics"]),
      mk("skeptic", undefined, ["logic"]),
      mk(UNASSIGNED_PROJECT_MANAGER_AVATAR_ID, [
        "system",
        "monitor:unassigned_projects",
      ]),
    ];
    setRoutingCatalogRef(catalog);

    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    /** Run a poll so the monitor's prompt exists and its suggestion cache is warm. */
    const res = await pollAll("startup", catalog);
    postMonitorPost(res.postsByMonitor[0]!.posts[0]!, "unassigned_projects");
    expect(posted).toHaveLength(1);
    const prompt = posted[0]!;

    /** Act: user clicks "Suggest owners". */
    const suggestAllAction = prompt.syntheticActions!.find(
      (a) => a.id === "suggest_all"
    )!;
    await runSyntheticAction(prompt, suggestAllAction);

    /** Assert: two follow-up posts (one per project) each offering skip + at least one suggestion. */
    const followUps = posted.slice(1);
    expect(followUps).toHaveLength(2);
    for (const f of followUps) {
      const ids = f.syntheticActions!.map((a) => a.id);
      expect(ids.some((id) => id.startsWith("skip:"))).toBe(true);
      expect(ids.some((id) => id.startsWith("assign:"))).toBe(true);
    }

    /** Project 1 (poetry) should suggest muse first; project 2 should suggest accomplice. */
    const f1 = followUps.find((m) => m.content.startsWith("Poetry"))!;
    const f2 = followUps.find((m) => m.content.startsWith("Tactical"))!;
    const firstAssign = (msg: ConversationMessage) =>
      msg
        .syntheticActions!.filter((a) => a.id.startsWith("assign:"))[0]!;
    expect(firstAssign(f1).id).toContain(":muse");
    expect(firstAssign(f2).id).toContain(":accomplice");

    /** Act: click "muse" on project 1. */
    await runSyntheticAction(f1, firstAssign(f1));

    /** Assert: project 1 now has an owner in the platform store. */
    const { getPlatformStore } = await import("../platform/store");
    const stored = getPlatformStore().projects[p1.id];
    expect(stored?.ownerAvatarId).toBe("muse");
    /** And a confirmation post was appended. */
    const confirm = posted[posted.length - 1]!;
    expect(confirm.content).toContain("Assigned");
    expect(confirm.content).toContain("muse");
    /** Project 2 remains unassigned. */
    expect(getPlatformStore().projects[p2.id]?.ownerAvatarId).toBeUndefined();
  });
});
