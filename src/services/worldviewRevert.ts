import type { WorldviewAuditRecord } from "./worldviewAudit";
import {
  patchWorldMetadata,
  replaceUserProfile,
} from "./worldMetadata/store";
import { patchWorldMetadataProjectsForExecution } from "./projectSync";
import type { WorldviewToolCall } from "./worldviewTools/parse";

function structuralRevert(tool: WorldviewToolCall): void {
  switch (tool.name) {
    case "world_metadata.patch_projects": {
      const patch = tool.args.patch as Record<string, unknown> | undefined;
      if (!patch || typeof patch !== "object") return;
      const del: Record<string, null> = {};
      for (const k of Object.keys(patch)) del[k] = null;
      patchWorldMetadataProjectsForExecution(del);
      break;
    }
    case "world_metadata.patch_people": {
      const patch = tool.args.patch as Record<string, unknown> | undefined;
      if (!patch || typeof patch !== "object") return;
      const del: Record<string, null> = {};
      for (const k of Object.keys(patch)) del[k] = null;
      patchWorldMetadata(del);
      break;
    }
    default:
      break;
  }
}

/**
 * Undo successful patch tools from one audit row: removes project/person keys that were
 * touched, then restores the user profile snapshot if present.
 *
 * Note: deleting a project/person removes the whole record for those ids (best-effort
 * undo when the model merged bad data into an existing id).
 */
export function revertWorldviewAuditRecordPatches(rec: WorldviewAuditRecord): void {
  const calls = rec.revertiblePatchCalls ?? [];
  for (const tool of [...calls].reverse()) {
    if (tool.name === "user_profile.patch") continue;
    structuralRevert(tool);
  }
  if (rec.userProfileBefore) {
    replaceUserProfile(rec.userProfileBefore);
  }
}
