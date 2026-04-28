import { beforeEach, describe, expect, it, vi } from "vitest";

const enqueueVoiceSnippet = vi.fn();
const playCueSynthetic = vi.fn();

vi.mock("./audioDirector", () => ({
  enqueueVoiceSnippet,
  playCueSynthetic,
  syncSoundscape: vi.fn(),
  resumeAudioContext: vi.fn(async () => true),
}));

describe("mountPlatformAudioBridge avatar_creation_task_satisfied", () => {
  beforeEach(() => {
    enqueueVoiceSnippet.mockClear();
    playCueSynthetic.mockClear();
  });

  it("enqueues the completion cue when a task is satisfied", async () => {
    const { mountPlatformAudioBridge } = await import("./platformAudioBridge");
    const { publishPlatformEvent } = await import("../platform/bus");
    const { AUDIO_SNIPPET_IDS } = await import("./cueRegistry");

    const off = mountPlatformAudioBridge({
      getAvatarById: (id) =>
        id === "a1"
          ? ({
              id: "a1",
              givenName: "Sam",
              processName: "sam",
              appellation: "",
              description: "",
              tags: [],
              personality: "",
              interests: [],
              assignedTasks: [],
              opinions: {},
            } as import("../../types").Avatar)
          : undefined,
    });

    publishPlatformEvent({
      type: "avatar_creation_task_satisfied",
      taskId: "t1",
      matchedAvatarId: "a1",
    });

    off();

    expect(enqueueVoiceSnippet).toHaveBeenCalledWith(
      AUDIO_SNIPPET_IDS.avatarCreationTaskDone,
      expect.any(String),
      expect.objectContaining({
        anchor: "storage",
        avatarId: "a1",
        cueId: AUDIO_SNIPPET_IDS.avatarCreationTaskDone,
      })
    );
  });
});
