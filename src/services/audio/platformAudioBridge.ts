/**
 * Maps platform bus + timer cues to the audio director (throttled, subtle).
 */

import type { Avatar } from "../../types";
import { subscribePlatformEvents, type PlatformBusEvent } from "../platform/bus";
import { onCue } from "../timerCueSystem";
import { createThrottleState, tryThrottle } from "./eventThrottle";
import { AUDIO_SNIPPET_IDS, voiceProfileIdForAvatar } from "./cueRegistry";
import { enqueueVoiceSnippet, playCueSynthetic } from "./audioDirector";

const heartbeatThrottle = createThrottleState();
const cacheUpdateThrottle = createThrottleState();
const topChangedThrottle = createThrottleState();

function handlePlatformEvent(
  evt: PlatformBusEvent,
  getAvatarById: (id: string) => Avatar | undefined
): void {
  const now = Date.now();
  switch (evt.type) {
    case "runner_heartbeat":
      if (tryThrottle(heartbeatThrottle, 20_000, now)) {
        playCueSynthetic("soft_tick", {
          anchor: "storage",
          cueId: "runner_heartbeat",
        });
      }
      break;
    case "source_cache_updated":
      if (tryThrottle(cacheUpdateThrottle, 4_000, now)) {
        playCueSynthetic("shimmer", {
          anchor: "storage",
          cueId: "source_cache_updated",
        });
      }
      break;
    case "source_top_changed":
      if (tryThrottle(topChangedThrottle, 5_000, now)) {
        playCueSynthetic("blip", {
          anchor: "storage",
          cueId: "source_top_changed",
        });
      }
      break;
    case "scheduler_fire": {
      const avatar = getAvatarById(evt.ownerAvatarId);
      enqueueVoiceSnippet(
        AUDIO_SNIPPET_IDS.schedulerBlip,
        voiceProfileIdForAvatar(avatar),
        {
          anchor: "avatar",
          avatarId: evt.ownerAvatarId,
          cueId: AUDIO_SNIPPET_IDS.schedulerBlip,
        }
      );
      break;
    }
    case "avatar_creation_task_satisfied": {
      const avatar = getAvatarById(evt.matchedAvatarId);
      enqueueVoiceSnippet(
        AUDIO_SNIPPET_IDS.avatarCreationTaskDone,
        voiceProfileIdForAvatar(avatar),
        {
          anchor: "storage",
          avatarId: evt.matchedAvatarId,
          cueId: AUDIO_SNIPPET_IDS.avatarCreationTaskDone,
        }
      );
      break;
    }
    default:
      break;
  }
}

function handleTimerCue(
  cue: { type: string; payload?: unknown },
  getAvatarById: (id: string) => Avatar | undefined
): void {
  if (cue.type !== "timer-expired" && cue.type !== "timer_due") {
    return;
  }
  const p = cue.payload;
  const avatarId =
    p && typeof p === "object" && "avatarId" in p && typeof (p as { avatarId?: unknown }).avatarId === "string"
      ? (p as { avatarId: string }).avatarId
      : undefined;
  const avatar = avatarId ? getAvatarById(avatarId) : undefined;
  enqueueVoiceSnippet(
    AUDIO_SNIPPET_IDS.timerDue,
    voiceProfileIdForAvatar(avatar),
    avatarId
      ? {
          anchor: "avatar",
          avatarId,
          cueId: AUDIO_SNIPPET_IDS.timerDue,
        }
      : {
          anchor: "global",
          cueId: AUDIO_SNIPPET_IDS.timerDue,
        }
  );
}

export type PlatformAudioBridgeOptions = {
  getAvatarById: (id: string) => Avatar | undefined;
};

/**
 * Subscribe to platform + timer cues. Returns disposer.
 */
export function mountPlatformAudioBridge(
  opts: PlatformAudioBridgeOptions
): () => void {
  const offBus = subscribePlatformEvents((evt) =>
    handlePlatformEvent(evt, opts.getAvatarById)
  );
  const offCue = onCue((cue) => handleTimerCue(cue, opts.getAvatarById));
  return () => {
    offBus();
    offCue();
  };
}
