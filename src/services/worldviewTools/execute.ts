import type { Avatar } from "../../types";
import {
  patchWorldMetadata,
  patchWorldMetadataProjects,
  patchUserProfile,
  getWorldMetadata,
} from "../worldMetadata/store";
import type { PersonMetadataRecord, ProjectMetadataRecord } from "../worldMetadata/types";
import { ensureProjectTaskForAvatar } from "../projectAvatarLink";
import { managedProjectIdsForAvatar } from "../avatarRoster/popIn";
import { appendWorldviewAuditRecord } from "../worldviewAudit";
import { formatWorldviewToolArgsForAudit } from "../worldviewAuditArgsPreview";
import { avatarMayUseAgenticTool } from "../agenticTools/registry";
import type { WorldviewToolCall } from "./parse";

const MAX_PATCH_KEYS = 12;
const MAX_STRING_FIELD = 8000;

function clampStr(s: unknown, max: number): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

/**
 * Apply validated worldview tool calls; returns per-tool results.
 */
export function executeWorldviewTools(
  tools: WorldviewToolCall[],
  meta: {
    avatarId: string;
    userMessageId: string;
    sourceEmailId?: string;
    /** When true, do not append audit (caller batches with other tool results). */
    skipAudit?: boolean;
    /** When set, tools not in `allowedAgenticToolIds` fail with `permission_denied`. */
    avatar?: Avatar;
    /** When set with user turns, restricts new project ids to this avatar only. */
    executorAvatarId?: string;
  }
): { name: string; ok: boolean; error?: string }[] {
  const results: { name: string; ok: boolean; error?: string }[] = [];
  for (const tool of tools) {
    if (meta.avatar && !avatarMayUseAgenticTool(meta.avatar, tool.name)) {
      results.push({ name: tool.name, ok: false, error: "permission_denied" });
      continue;
    }
    try {
      switch (tool.name) {
        case "world_metadata.patch_projects": {
          const patch = tool.args.patch as
            | Record<string, Partial<ProjectMetadataRecord> | null>
            | undefined;
          if (!patch || typeof patch !== "object") {
            results.push({ name: tool.name, ok: false, error: "bad patch" });
            break;
          }
          const keys = Object.keys(patch);
          if (keys.length > MAX_PATCH_KEYS) {
            results.push({ name: tool.name, ok: false, error: "too many keys" });
            break;
          }
          const execId = meta.executorAvatarId?.trim();
          let patchToApply = patch;
          if (execId) {
            const existing = getWorldMetadata().projects;
            const isExecutor = meta.avatarId === execId;
            const managed = new Set(managedProjectIdsForAvatar(meta.avatarId));
            const filtered: Record<string, Partial<ProjectMetadataRecord> | null> = {};
            for (const [key, rec] of Object.entries(patch)) {
              if (rec === null) {
                if (isExecutor || managed.has(key)) {
                  filtered[key] = rec;
                }
                continue;
              }
              if (isExecutor) {
                filtered[key] = rec;
                continue;
              }
              if (existing[key] && managed.has(key)) {
                filtered[key] = rec;
              }
            }
            if (Object.keys(filtered).length === 0) {
              results.push({
                name: tool.name,
                ok: false,
                error: "permission_denied_projects",
              });
              break;
            }
            patchToApply = filtered;
          }
          patchWorldMetadataProjects(patchToApply);
          results.push({ name: tool.name, ok: true });
          for (const key of Object.keys(patchToApply)) {
            if (patchToApply[key] === null) continue;
            ensureProjectTaskForAvatar(meta.avatarId, key);
          }
          break;
        }
        case "world_metadata.patch_people": {
          const patch = tool.args.patch as
            | Record<string, Partial<PersonMetadataRecord> | null>
            | undefined;
          if (!patch || typeof patch !== "object") {
            results.push({ name: tool.name, ok: false, error: "bad patch" });
            break;
          }
          const keys = Object.keys(patch);
          if (keys.length > MAX_PATCH_KEYS) {
            results.push({ name: tool.name, ok: false, error: "too many keys" });
            break;
          }
          patchWorldMetadata(patch);
          results.push({ name: tool.name, ok: true });
          break;
        }
        case "user_profile.patch": {
          const p = tool.args.patch as Record<string, unknown> | undefined;
          if (!p || typeof p !== "object") {
            results.push({ name: tool.name, ok: false, error: "bad patch" });
            break;
          }
          patchUserProfile({
            displayName: clampStr(p.displayName, MAX_STRING_FIELD),
            pronouns: clampStr(p.pronouns, 200),
            notes: clampStr(p.notes, MAX_STRING_FIELD),
          });
          results.push({ name: tool.name, ok: true });
          break;
        }
        default:
          results.push({ name: tool.name, ok: false, error: "unknown tool" });
      }
    } catch (e) {
      results.push({
        name: tool.name,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  if (results.length > 0 && !meta.skipAudit) {
    appendWorldviewAuditRecord({
      avatarId: meta.avatarId,
      userMessageId: meta.userMessageId,
      sourceEmailId: meta.sourceEmailId,
      toolResults: results.map((r, i) => {
        const t = tools[i];
        return {
          ...r,
          argsPreview: t ? formatWorldviewToolArgsForAudit(t) : undefined,
        };
      }),
    });
  }

  return results;
}
