import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { executeWorldviewTools } from "./execute";
import { __resetPlatformStoreForTests } from "../platform/store";
import {
  ensureWorldMetadataLoaded,
  replaceUserProfile,
  patchWorldMetadataProjects,
  __resetWorldMetadataForTests,
  getWorldMetadata,
  applyPendingUserProfilePatch,
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
    __resetPlatformStoreForTests();
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

  it("denies avatars.workshop.open_draft without tool_owner:avatar_creation", () => {
    const r = executeWorldviewTools(
      [
        {
          name: "avatars.workshop.open_draft",
          args: { wikiQuery: "test" },
        },
      ],
      {
        avatarId: avatar.id,
        userMessageId: "u1",
        avatar,
      }
    );
    expect(r[0]?.ok).toBe(false);
    expect(r[0]?.error).toBe("permission_denied");
  });

  it("allows avatars.workshop.open_draft for tool_owner:avatar_creation", () => {
    const exchequer = {
      ...avatar,
      id: "blessed_exchequer",
      systemTags: ["system", "tool_owner:avatar_creation"],
      allowedAgenticToolIds: ["avatars.workshop.open_draft"],
    } as Avatar;
    const r = executeWorldviewTools(
      [{ name: "avatars.workshop.open_draft", args: { wikiQuery: "Luke Skywalker" } }],
      {
        avatarId: exchequer.id,
        userMessageId: "u1",
        avatar: exchequer,
      }
    );
    expect(r[0]?.ok).toBe(true);
  });

  it("rejects avatars.workshop.open_draft when both args empty", () => {
    const exchequer = {
      ...avatar,
      id: "blessed_exchequer",
      systemTags: ["system", "tool_owner:avatar_creation"],
      allowedAgenticToolIds: ["avatars.workshop.open_draft"],
    } as Avatar;
    const r = executeWorldviewTools(
      [{ name: "avatars.workshop.open_draft", args: {} }],
      {
        avatarId: exchequer.id,
        userMessageId: "u1",
        avatar: exchequer,
      }
    );
    expect(r[0]?.ok).toBe(false);
    expect(r[0]?.error).toBe("missing seedText and wikiQuery");
  });
});

describe("executeWorldviewTools user_profile.patch gating", () => {
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
    __resetPlatformStoreForTests();
    __resetWorldMetadataForTests();
    ensureWorldMetadataLoaded();
    replaceUserProfile({ displayName: "Pat", notes: "", pronouns: "", updatedAt: 0 });
    saveTasks([]);
  });

  it("stores pending when notes change without save language", () => {
    const profileAvatar = {
      ...avatar,
      allowedAgenticToolIds: ["user_profile.patch"],
    } as Avatar;
    const r = executeWorldviewTools(
      [{ name: "user_profile.patch", args: { patch: { notes: "Cast list from TV" } } }],
      {
        avatarId: "muse",
        userMessageId: "u1",
        avatar: profileAvatar,
        latestUserMessageContent: "Who was in Lower Decks?",
      }
    );
    expect(r[0]?.ok).toBe(true);
    expect(r[0]?.userProfilePending).toBe(true);
    expect(getWorldMetadata().pendingUserProfilePatch?.patch.notes).toBe("Cast list from TV");
    expect(getWorldMetadata().userProfile.notes).toBeFalsy();
  });

  it("applies immediately when user asks to save profile", () => {
    const profileAvatar = {
      ...avatar,
      allowedAgenticToolIds: ["user_profile.patch"],
    } as Avatar;
    const r = executeWorldviewTools(
      [{ name: "user_profile.patch", args: { patch: { notes: "I prefer tea" } } }],
      {
        avatarId: "muse",
        userMessageId: "u1",
        avatar: profileAvatar,
        latestUserMessageContent: "Please update my profile notes: I prefer tea",
      }
    );
    expect(r[0]?.ok).toBe(true);
    expect(r[0]?.userProfilePending).toBeUndefined();
    expect(getWorldMetadata().userProfile.notes).toBe("I prefer tea");
    expect(getWorldMetadata().pendingUserProfilePatch).toBeNull();
  });

  it("applyPendingUserProfilePatch merges pending into profile", () => {
    const profileAvatar = {
      ...avatar,
      allowedAgenticToolIds: ["user_profile.patch"],
    } as Avatar;
    executeWorldviewTools(
      [{ name: "user_profile.patch", args: { patch: { notes: "pending text" } } }],
      {
        avatarId: "muse",
        userMessageId: "u1",
        avatar: profileAvatar,
        latestUserMessageContent: "random",
      }
    );
    applyPendingUserProfilePatch();
    expect(getWorldMetadata().userProfile.notes).toBe("pending text");
    expect(getWorldMetadata().pendingUserProfilePatch).toBeNull();
  });
});
