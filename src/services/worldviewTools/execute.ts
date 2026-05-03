import type { Avatar } from "../../types";
import {
  patchWorldMetadata,
  patchUserProfile,
  getWorldMetadata,
  setPendingUserProfilePatch,
} from "../worldMetadata/store";
import type { PersonMetadataRecord, ProjectMetadataRecord } from "../worldMetadata/types";
import { ensureProjectTaskForAvatar } from "../projectAvatarLink";
import { patchWorldMetadataProjectsForExecution } from "../projectSync";
import { managedProjectIdsForAvatar } from "../avatarRoster/popIn";
import { appendWorldviewAuditRecord } from "../worldviewAudit";
import { formatWorldviewToolArgsForAudit } from "../worldviewAuditArgsPreview";
import { avatarMayUseAgenticTool } from "../agenticTools/registry";
import {
  recordDraft,
  type PlatformCalendarDraftPayload,
  type PlatformEmailDraftPayload,
  type PlatformTaskDraftPayload,
} from "../platform";
import type { WorldviewToolCall } from "./parse";
import type { UserProfileRecord } from "../worldMetadata/types";

const MAX_PATCH_KEYS = 12;
const MAX_STRING_FIELD = 8000;

function clampStr(s: unknown, max: number): string | undefined {
  if (typeof s !== "string") return undefined;
  const t = s.trim();
  if (!t) return undefined;
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export type WorldviewToolExecutionResult = {
  name: string;
  ok: boolean;
  error?: string;
  /** When set, `user_profile.patch` was stored as a pending chat proposal instead of applied. */
  userProfilePending?: boolean;
};

function normProfileField(s: string | undefined): string {
  return (s ?? "").trim();
}

function userProfilePatchIsMaterial(
  prev: UserProfileRecord,
  patch: { displayName?: string; pronouns?: string; notes?: string }
): boolean {
  const nextDisplay =
    patch.displayName !== undefined ? patch.displayName : prev.displayName;
  const nextPronouns =
    patch.pronouns !== undefined ? patch.pronouns : prev.pronouns;
  const nextNotes = patch.notes !== undefined ? patch.notes : prev.notes;
  return (
    normProfileField(nextDisplay) !== normProfileField(prev.displayName) ||
    normProfileField(nextPronouns) !== normProfileField(prev.pronouns) ||
    normProfileField(nextNotes) !== normProfileField(prev.notes)
  );
}

/** User explicitly asked to persist identity/preferences to their profile this turn. */
export function userExplicitProfileSaveIntent(latestUserMessageContent: string | undefined): boolean {
  if (!latestUserMessageContent) return false;
  const t = latestUserMessageContent.trim().toLowerCase();
  if (t.length < 8) return false;
  const saveCue = /\b(remember|update|save|store|add|write)\b/.test(t);
  const profileCue =
    /\b(my\s+)?profile\b|\bdisplay\s*name\b|\bpronouns\b|\bmy\s+notes\b/.test(t);
  return saveCue && profileCue;
}

function newPendingPatchId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  return g.crypto?.randomUUID?.() ?? `pp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
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
    /** Latest user line for this turn (used to gate `user_profile.patch`). */
    latestUserMessageContent?: string;
  }
): WorldviewToolExecutionResult[] {
  const results: WorldviewToolExecutionResult[] = [];
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
          patchWorldMetadataProjectsForExecution(patchToApply, meta.avatarId);
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
          const patch = {
            displayName: clampStr(p.displayName, MAX_STRING_FIELD),
            pronouns: clampStr(p.pronouns, 200),
            notes: clampStr(p.notes, MAX_STRING_FIELD),
          };
          const prev = getWorldMetadata().userProfile;
          const material = userProfilePatchIsMaterial(prev, patch);
          const explicitSave = userExplicitProfileSaveIntent(meta.latestUserMessageContent);
          if (material && !explicitSave) {
            setPendingUserProfilePatch({
              id: newPendingPatchId(),
              patch,
              requestedByAvatarId: meta.avatarId,
              userMessageId: meta.userMessageId,
              createdAt: Date.now(),
            });
            results.push({ name: tool.name, ok: true, userProfilePending: true });
            break;
          }
          patchUserProfile(patch);
          results.push({ name: tool.name, ok: true });
          break;
        }
        case "drafts.tasks": {
          const a = tool.args as Record<string, unknown>;
          const projectId = clampStr(a.projectId, 200);
          const title = clampStr(a.title, 400);
          if (!projectId || !title) {
            results.push({
              name: tool.name,
              ok: false,
              error: "missing projectId or title",
            });
            break;
          }
          const payload: PlatformTaskDraftPayload = {
            kind: "task",
            projectId,
            title,
            notes: clampStr(a.notes, MAX_STRING_FIELD),
            dueAt: typeof a.dueAt === "number" ? a.dueAt : undefined,
            ownerAvatarId: clampStr(a.ownerAvatarId, 100),
          };
          recordDraft({
            kind: "task",
            requestedByAvatarId: meta.avatarId,
            sourceUserMessageId: meta.userMessageId,
            rationale: clampStr(a.rationale, 1000),
            payload,
          });
          results.push({ name: tool.name, ok: true });
          break;
        }
        case "drafts.calendar_event": {
          const a = tool.args as Record<string, unknown>;
          const title = clampStr(a.title, 400);
          const startAt = typeof a.startAt === "number" ? a.startAt : undefined;
          if (!title || startAt === undefined) {
            results.push({
              name: tool.name,
              ok: false,
              error: "missing title or startAt",
            });
            break;
          }
          const attendeesRaw = a.attendees;
          const attendees = Array.isArray(attendeesRaw)
            ? attendeesRaw.filter((v): v is string => typeof v === "string")
            : undefined;
          const payload: PlatformCalendarDraftPayload = {
            kind: "calendar_event",
            title,
            startAt,
            endAt: typeof a.endAt === "number" ? a.endAt : undefined,
            notes: clampStr(a.notes, MAX_STRING_FIELD),
            attendees,
          };
          recordDraft({
            kind: "calendar_event",
            requestedByAvatarId: meta.avatarId,
            sourceUserMessageId: meta.userMessageId,
            rationale: clampStr(a.rationale, 1000),
            payload,
          });
          results.push({ name: tool.name, ok: true });
          break;
        }
        case "drafts.email_reply": {
          const a = tool.args as Record<string, unknown>;
          const body = clampStr(a.body, MAX_STRING_FIELD);
          const toRaw = a.to;
          const to = Array.isArray(toRaw)
            ? toRaw.filter((v): v is string => typeof v === "string")
            : [];
          if (!body || to.length === 0) {
            results.push({
              name: tool.name,
              ok: false,
              error: "missing body or to",
            });
            break;
          }
          const ccRaw = a.cc;
          const cc = Array.isArray(ccRaw)
            ? ccRaw.filter((v): v is string => typeof v === "string")
            : undefined;
          const payload: PlatformEmailDraftPayload = {
            kind: "email_reply",
            inReplyToMessageId: clampStr(a.inReplyToMessageId, 200),
            to,
            cc,
            subject: clampStr(a.subject, 400),
            body,
          };
          recordDraft({
            kind: "email_reply",
            requestedByAvatarId: meta.avatarId,
            sourceUserMessageId: meta.userMessageId,
            rationale: clampStr(a.rationale, 1000),
            payload,
          });
          results.push({ name: tool.name, ok: true });
          break;
        }
        case "avatars.workshop.open_draft": {
          const a = tool.args as Record<string, unknown>;
          const seedRaw = typeof a.seedText === "string" ? a.seedText.trim() : "";
          const wikiRaw = typeof a.wikiQuery === "string" ? a.wikiQuery.trim() : "";
          if (!seedRaw && !wikiRaw) {
            results.push({
              name: tool.name,
              ok: false,
              error: "missing seedText and wikiQuery",
            });
            break;
          }
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
