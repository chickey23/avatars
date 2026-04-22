import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetPlatformDraftsForTests,
  ensurePlatformDraftsLoadedSync,
  getPlatformDrafts,
  recordDraft,
  setDraftStatus,
} from "./drafts";
import { PLATFORM_DRAFTS_STORAGE_KEY } from "./constants";

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

describe("platform drafts", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    __resetPlatformDraftsForTests();
    localStorage.removeItem(PLATFORM_DRAFTS_STORAGE_KEY);
    ensurePlatformDraftsLoadedSync();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records a task draft as pending and credits the requester", () => {
    const d = recordDraft({
      kind: "task",
      requestedByAvatarId: "muse",
      payload: {
        kind: "task",
        projectId: "proj_1",
        title: "Sketch cover art",
      },
    });
    expect(d.status).toBe("pending");
    expect(d.requestedByAvatarId).toBe("muse");
    expect(getPlatformDrafts().drafts[d.id]).toBeDefined();
  });

  it("rejects a payload/kind mismatch", () => {
    expect(() =>
      recordDraft({
        kind: "task",
        requestedByAvatarId: "muse",
        payload: {
          kind: "calendar_event",
          title: "x",
          startAt: 1,
        },
      })
    ).toThrow();
  });

  it("transitions status and stamps updatedAt", () => {
    const d = recordDraft({
      kind: "email_reply",
      requestedByAvatarId: "muse",
      payload: {
        kind: "email_reply",
        to: ["a@x"],
        body: "hi",
      },
    });
    const approved = setDraftStatus(d.id, "approved", "user");
    expect(approved?.status).toBe("approved");
    expect(approved!.updatedAt).toBeGreaterThanOrEqual(d.updatedAt);
  });

  it("returns null when changing status of unknown draft", () => {
    expect(setDraftStatus("nope", "approved", "user")).toBeNull();
  });
});
