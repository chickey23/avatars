import { describe, it, expect } from "vitest";
import type { Avatar, SituationContext } from "../types";
import {
  MAX_PRIMARY_SLOTS,
  resolvePrimarySlotCount,
  getActivePrimaryAvatars,
  getActivePrimaryAvatarsPreferringSelected,
} from "./primaryRoster";

const emptyCtx = (): SituationContext => ({
  conversationThread: [],
  recentEvents: [],
  cuesAndTriggers: [],
});

describe("resolvePrimarySlotCount", () => {
  it("defaults to 3 when unset and caps by catalog length", () => {
    expect(resolvePrimarySlotCount(emptyCtx(), 3)).toBe(3);
    expect(resolvePrimarySlotCount(emptyCtx(), 2)).toBe(2);
    expect(resolvePrimarySlotCount(emptyCtx(), 100)).toBe(3);
  });

  it("respects primaryAvatarSlotCount within cap", () => {
    const ctx = { ...emptyCtx(), primaryAvatarSlotCount: 5 };
    expect(resolvePrimarySlotCount(ctx, 10)).toBe(5);
    expect(resolvePrimarySlotCount(ctx, 4)).toBe(4);
  });

  it("clamps to MAX_PRIMARY_SLOTS when catalog is large", () => {
    const ctx = { ...emptyCtx(), primaryAvatarSlotCount: 99 };
    expect(resolvePrimarySlotCount(ctx, 100)).toBe(MAX_PRIMARY_SLOTS);
  });

  it("returns 0 when catalog is empty", () => {
    expect(resolvePrimarySlotCount(emptyCtx(), 0)).toBe(0);
  });
});

describe("getActivePrimaryAvatars", () => {
  const catalog = [{ id: "a" }, { id: "b" }, { id: "c" }] as Avatar[];

  it("slices catalog", () => {
    expect(getActivePrimaryAvatars(catalog, 2)).toEqual([catalog[0], catalog[1]]);
    expect(getActivePrimaryAvatars(catalog, 0)).toEqual([]);
  });
});

describe("getActivePrimaryAvatarsPreferringSelected", () => {
  const catalog = [{ id: "a" }, { id: "b" }, { id: "c" }] as Avatar[];

  it("matches first-k catalog when nothing selected", () => {
    expect(getActivePrimaryAvatarsPreferringSelected(catalog, 2, [])).toEqual(
      getActivePrimaryAvatars(catalog, 2)
    );
  });

  it("pulls selected avatars ahead of catalog order", () => {
    expect(getActivePrimaryAvatarsPreferringSelected(catalog, 2, ["c"])).toEqual([
      catalog[2],
      catalog[0],
    ]);
  });

  it("keeps catalog order within selected then fills with unselected", () => {
    expect(getActivePrimaryAvatarsPreferringSelected(catalog, 3, ["c", "a"])).toEqual([
      catalog[0],
      catalog[2],
      catalog[1],
    ]);
  });

  it("drops unselected before dropping selected when k is small", () => {
    expect(getActivePrimaryAvatarsPreferringSelected(catalog, 2, ["c", "b"])).toEqual([
      catalog[1],
      catalog[2],
    ]);
  });
});
