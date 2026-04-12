import { describe, it, expect } from "vitest";
import type { SituationContext, Avatar } from "../types";
import { defaultAvatars } from "../data/defaultAvatars";
import {
  getFullAvatarCatalog,
  findAvatarInCatalog,
  isDefaultAvatarId,
} from "./avatarCatalog";

const emptyCtx = (): SituationContext => ({
  conversationThread: [],
  recentEvents: [],
  cuesAndTriggers: [],
});

describe("getFullAvatarCatalog", () => {
  it("returns defaults when no user avatars", () => {
    expect(getFullAvatarCatalog(emptyCtx())).toEqual(defaultAvatars);
  });

  it("appends user avatars", () => {
    const u = {
      id: "u1",
      processName: "u1",
      givenName: "Custom",
      appellation: "Test",
      description: "d",
      tags: [],
      personality: "p",
      interests: [],
      assignedTasks: [],
      opinions: {},
    } satisfies Avatar;
    const ctx = { ...emptyCtx(), userAvatars: [u] };
    expect(getFullAvatarCatalog(ctx)).toEqual([...defaultAvatars, u]);
  });
});

describe("findAvatarInCatalog", () => {
  it("finds by id", () => {
    const c = getFullAvatarCatalog(emptyCtx());
    expect(findAvatarInCatalog(c, defaultAvatars[0].id)?.id).toBe(
      defaultAvatars[0].id
    );
  });
});

describe("isDefaultAvatarId", () => {
  it("recognizes built-in ids", () => {
    expect(isDefaultAvatarId("muse")).toBe(true);
    expect(isDefaultAvatarId("unknown")).toBe(false);
  });
});
