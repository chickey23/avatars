import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { executeWorldviewTools } from "./execute";
import {
  ensureWorldMetadataLoaded,
  replaceUserProfile,
  patchWorldMetadataProjects,
} from "../worldMetadata/store";
import { saveTasks } from "../longTermTasks";
import type { Avatar } from "../../types";

const avatar = {
  id: "muse",
  processName: "p",
  givenName: "M",
  appellation: "m",
  description: "d",
  tags: [],
  personality: "x",
  interests: [],
  opinions: {},
  assignedTasks: [],
  allowedAgenticToolIds: ["world_metadata.patch_projects"],
} as Avatar;

const lsStore = new Map<string, string>();

describe("executeWorldviewTools permissions", () => {
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
    ensureWorldMetadataLoaded();
    replaceUserProfile({ displayName: "", pronouns: "", notes: "", updatedAt: 0 });
    saveTasks([]);
  });

  it("returns permission_denied when avatar cannot use tool", () => {
    const r = executeWorldviewTools(
      [{ name: "user_profile.patch", args: { patch: { notes: "x" } } }],
      {
        avatarId: avatar.id,
        userMessageId: "u1",
        avatar,
      }
    );
    expect(r[0]?.ok).toBe(false);
    expect(r[0]?.error).toBe("permission_denied");
  });

  it("denies new project ids for non-executor when executorAvatarId is set", () => {
    patchWorldMetadataProjects({
      existing_proj: {
        title: "Existing",
        notes: "",
        summary: "",
        updatedAt: 1,
      },
    });
    const museAvatar = { ...avatar, id: "muse" } as Avatar;
    const r = executeWorldviewTools(
      [
        {
          name: "world_metadata.patch_projects",
          args: { patch: { brand_new_x: { title: "N", notes: "", summary: "" } } },
        },
      ],
      {
        avatarId: "muse",
        userMessageId: "u1",
        avatar: museAvatar,
        executorAvatarId: "accomplice",
      }
    );
    expect(r[0]?.ok).toBe(false);
    expect(r[0]?.error).toBe("permission_denied_projects");
  });

  it("allows non-executor to patch managed existing project id", () => {
    patchWorldMetadataProjects({
      managed_only: {
        title: "M",
        notes: "",
        summary: "",
        updatedAt: 1,
      },
    });
    saveTasks([
      {
        id: "t1",
        avatarId: "muse",
        title: "task",
        status: "active",
        projectId: "managed_only",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
    const museAvatar = { ...avatar, id: "muse" } as Avatar;
    const r = executeWorldviewTools(
      [
        {
          name: "world_metadata.patch_projects",
          args: { patch: { managed_only: { title: "M2", notes: "x", summary: "" } } },
        },
      ],
      {
        avatarId: "muse",
        userMessageId: "u1",
        avatar: museAvatar,
        executorAvatarId: "accomplice",
      }
    );
    expect(r[0]?.ok).toBe(true);
  });
});
