/**
 * Synthetic Apply / Discard for avatar-proposed `user_profile.patch` when the
 * human did not use explicit save-to-profile language in the triggering turn.
 */

import {
  applyPendingUserProfilePatch,
  clearPendingUserProfilePatch,
  getWorldMetadata,
} from "../worldMetadata/store";
import { registerSyntheticAction } from "./actions";

export const USER_PROFILE_APPROVAL_MONITOR_TAG =
  "monitor:user_profile_patch_approval" as const;

export function installUserProfileApprovalActions(): void {
  registerSyntheticAction(
    USER_PROFILE_APPROVAL_MONITOR_TAG,
    "user_profile_apply_pending",
    ({ action }) => {
      const id =
        typeof (action.payload as { id?: unknown })?.id === "string"
          ? (action.payload as { id: string }).id
          : "";
      const pending = getWorldMetadata().pendingUserProfilePatch;
      if (!pending || pending.id !== id) return;
      applyPendingUserProfilePatch();
    }
  );
  registerSyntheticAction(
    USER_PROFILE_APPROVAL_MONITOR_TAG,
    "user_profile_discard_pending",
    ({ action }) => {
      const id =
        typeof (action.payload as { id?: unknown })?.id === "string"
          ? (action.payload as { id: string }).id
          : "";
      const pending = getWorldMetadata().pendingUserProfilePatch;
      if (!pending || pending.id !== id) return;
      clearPendingUserProfilePatch();
    }
  );
}
