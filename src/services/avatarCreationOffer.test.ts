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

describe("avatar creation offer", () => {
  beforeEach(() => {
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
});
