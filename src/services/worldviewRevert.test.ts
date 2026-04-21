import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { revertWorldviewAuditRecordPatches } from "./worldviewRevert";
import type { WorldviewAuditRecord } from "./worldviewAudit";
import * as store from "./worldMetadata/store";

describe("revertWorldviewAuditRecordPatches", () => {
  beforeEach(() => {
    vi.spyOn(store, "patchWorldMetadataProjects").mockImplementation(() =>
      store.getWorldMetadata()
    );
    vi.spyOn(store, "patchWorldMetadata").mockImplementation(() =>
      store.getWorldMetadata()
    );
    vi.spyOn(store, "replaceUserProfile").mockImplementation(() =>
      store.getWorldMetadata()
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes project keys from patch in reverse order then restores profile", () => {
    const rec: WorldviewAuditRecord = {
      id: "a",
      ts: 1,
      avatarId: "muse",
      userMessageId: "u",
      toolResults: [],
      revertiblePatchCalls: [
        {
          name: "world_metadata.patch_projects",
          args: { patch: { p1: { title: "A" } } },
        },
        {
          name: "user_profile.patch",
          args: { patch: { notes: "x" } },
        },
      ],
      userProfileBefore: { updatedAt: 99, notes: "before" },
    };
    revertWorldviewAuditRecordPatches(rec);
    expect(store.patchWorldMetadataProjects).toHaveBeenCalledWith({
      p1: null,
    });
    expect(store.replaceUserProfile).toHaveBeenCalledWith(
      expect.objectContaining({ notes: "before" })
    );
  });

  it("skips user_profile entries in structural loop", () => {
    const rec: WorldviewAuditRecord = {
      id: "b",
      ts: 1,
      avatarId: "muse",
      userMessageId: "u",
      toolResults: [],
      revertiblePatchCalls: [
        {
          name: "user_profile.patch",
          args: { patch: { notes: "x" } },
        },
      ],
      userProfileBefore: { updatedAt: 1 },
    };
    revertWorldviewAuditRecordPatches(rec);
    expect(store.patchWorldMetadataProjects).not.toHaveBeenCalled();
    expect(store.patchWorldMetadata).not.toHaveBeenCalled();
    expect(store.replaceUserProfile).toHaveBeenCalled();
  });
});
