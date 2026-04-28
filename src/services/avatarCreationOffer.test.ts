import { beforeEach, describe, expect, it } from "vitest";
import type { ConversationMessage } from "../types";
import {
  AVATAR_CREATION_OFFER_MONITOR_TAG,
  __resetAvatarCreationOfferForTests,
  installAvatarCreationOfferActions,
  postAvatarCreationWorkshopOffer,
  setAvatarCreationOfferOpenHandler,
} from "./avatarCreationOffer";
import {
  __resetSyntheticActionsForTests,
  runSyntheticAction,
} from "./monitors/actions";
import {
  __resetSyntheticPostForTests,
  setSyntheticPostSink,
} from "./monitors/postSynthetic";
import {
  __resetPlatformStoreForTests,
  ensurePlatformStoreLoadedSync,
  getPlatformStore,
  upsertProject,
  upsertTask,
} from "./platform/store";

function installMemoryLocalStorage(): void {
  const data = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, String(value));
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
      clear: () => data.clear(),
    },
  });
}

describe("avatar creation offer", () => {
  beforeEach(() => {
    installMemoryLocalStorage();
    localStorage.clear();
    __resetPlatformStoreForTests();
    ensurePlatformStoreLoadedSync();
    __resetSyntheticActionsForTests();
    __resetSyntheticPostForTests();
    __resetAvatarCreationOfferForTests();
  });

  it("posts an inline offer instead of opening the workshop immediately", () => {
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));

    const ok = postAvatarCreationWorkshopOffer({
      avatarId: "creator",
      intent: { wikiQuery: "Neo", seedText: "Create Neo" },
    });

    expect(ok).toBe(true);
    expect(posted).toHaveLength(1);
    expect(posted[0]?.monitorTag).toBe(AVATAR_CREATION_OFFER_MONITOR_TAG);
    expect(posted[0]?.content).toContain("Neo");
    expect(posted[0]?.syntheticActions?.map((a) => a.label)).toEqual([
      "Open draft",
      "Refine prompt",
      "Not now",
    ]);
  });

  it("opens the workshop only when the Open draft action is clicked", async () => {
    const posted: ConversationMessage[] = [];
    const opened: unknown[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));
    setAvatarCreationOfferOpenHandler((intent) => opened.push(intent));
    installAvatarCreationOfferActions();
    postAvatarCreationWorkshopOffer({
      avatarId: "creator",
      intent: { wikiQuery: "Ada", seedText: "Create Ada" },
    });

    const prompt = posted[0]!;
    const open = prompt.syntheticActions!.find((a) => a.label === "Open draft")!;
    await runSyntheticAction(prompt, open);

    expect(opened).toEqual([{ seedText: "Create Ada", wikiQuery: "Ada" }]);
  });

  it('cancels a linked platform task when "Not now" is clicked', async () => {
    const posted: ConversationMessage[] = [];
    setSyntheticPostSink(({ message }) => posted.push(message));
    installAvatarCreationOfferActions();

    const project = upsertProject({ title: "Q", actor: "test" });
    const task = upsertTask({
      projectId: project.id,
      title: "Create avatar: Bea",
      actor: "test",
      workflowStatus: "waiting_for_user",
      requiredCapability: { id: "avatar_creation", kind: "tool" },
    });

    postAvatarCreationWorkshopOffer({
      avatarId: "creator",
      intent: { wikiQuery: "Bea", seedText: "Create Bea" },
      linkedPlatformTaskId: task.id,
    });

    const prompt = posted[0]!;
    const notNow = prompt.syntheticActions!.find((a) => a.label === "Not now")!;
    await runSyntheticAction(prompt, notNow);

    expect(getPlatformStore().tasks[task.id]?.workflowStatus).toBe("cancelled");
  });
});
