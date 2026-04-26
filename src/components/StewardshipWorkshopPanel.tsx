import { useState } from "react";
import type { Avatar, SituationContext } from "../types";
import {
  buildCapabilityGroupRows,
  buildStewardshipWorkshopRows,
  capabilityGroupLabel,
  registeredNonGroupToolIds,
  toolCapabilityLabel,
} from "../services/avatarOperations";
import { AGENTIC_TOOL_IDS } from "../services/agenticTools";
import { isDefaultAvatarId } from "../store/avatarCatalog";

type Props = {
  fullAvatarCatalog: Avatar[];
  situationContext: SituationContext;
  patchSituationContext: (patch: Partial<SituationContext>) => void;
};

type ToolAllowMode = "default" | "none" | "custom";
type ToolAllowlistGroup = {
  id: ToolAllowMode;
  title: string;
  subtitle: string;
};

function displayName(avatar: Avatar): string {
  return `${avatar.givenName} (${avatar.id})`;
}

function statusLabel(status: "claimed" | "unclaimed" | "duplicate"): string {
  if (status === "claimed") return "Claimed";
  if (status === "duplicate") return "Duplicate";
  return "Unclaimed";
}

function joinClaimants(claimants: readonly Avatar[]): string {
  return claimants.length > 0 ? claimants.map((a) => a.givenName).join(", ") : "None";
}

function setTag(avatar: Avatar, tag: string, present: boolean): Avatar {
  const tags = avatar.systemTags ?? [];
  const has = tags.includes(tag);
  if (has === present) return avatar;
  const nextTags = present
    ? [...tags, tag]
    : tags.filter((existing) => existing !== tag);
  return {
    ...avatar,
    systemTags: nextTags.length > 0 ? nextTags : undefined,
  };
}

function allowMode(avatar: Avatar): ToolAllowMode {
  if (avatar.allowedAgenticToolIds === undefined) return "default";
  if (avatar.allowedAgenticToolIds.length === 0) return "none";
  return "custom";
}

const TOOL_ALLOWLIST_GROUPS: readonly ToolAllowlistGroup[] = [
  {
    id: "custom",
    title: "The Privileged",
    subtitle: "Avatars with custom allowlists. These rows can be tuned tool by tool.",
  },
  {
    id: "default",
    title: "The Chorus",
    subtitle: "Avatars using default general tools.",
  },
  {
    id: "none",
    title: "The Workers",
    subtitle: "Avatars with JSON agentic tools disabled.",
  },
];

export function StewardshipWorkshopPanel({
  fullAvatarCatalog,
  situationContext,
  patchSituationContext,
}: Props) {
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>(
    {}
  );
  const stewardshipRows = buildStewardshipWorkshopRows(fullAvatarCatalog);
  const capabilityGroupRows = buildCapabilityGroupRows(fullAvatarCatalog);
  const nonGroupToolIds = registeredNonGroupToolIds();
  const avatarsByAllowMode = TOOL_ALLOWLIST_GROUPS.map((group) => ({
    ...group,
    avatars: fullAvatarCatalog
      .filter((avatar) => allowMode(avatar) === group.id)
      .sort((a, b) => a.givenName.localeCompare(b.givenName)),
  }));

  const commitAvatarUpdates = (updates: Map<string, Avatar>) => {
    if (updates.size === 0) return;
    const patch: Partial<SituationContext> = {};
    const builtinUpdates = Array.from(updates.values()).filter((avatar) =>
      isDefaultAvatarId(avatar.id)
    );
    if (builtinUpdates.length > 0) {
      patch.builtinAvatarEdits = {
        ...(situationContext.builtinAvatarEdits ?? {}),
      };
      for (const avatar of builtinUpdates) {
        patch.builtinAvatarEdits[avatar.id] = avatar;
      }
    }

    const userUpdates = Array.from(updates.values()).filter(
      (avatar) => !isDefaultAvatarId(avatar.id)
    );
    if (userUpdates.length > 0) {
      const byId = new Map(userUpdates.map((avatar) => [avatar.id, avatar]));
      patch.userAvatars = (situationContext.userAvatars ?? []).map(
        (avatar) => byId.get(avatar.id) ?? avatar
      );
    }

    patchSituationContext(patch);
  };

  const assignSingleTag = (tag: string, avatarId: string) => {
    const updates = new Map<string, Avatar>();
    for (const avatar of fullAvatarCatalog) {
      const next = setTag(avatar, tag, avatar.id === avatarId);
      if (next !== avatar) updates.set(avatar.id, next);
    }
    commitAvatarUpdates(updates);
    setAssignmentDrafts((prev) => {
      const next = { ...prev };
      delete next[tag];
      return next;
    });
  };

  const updateAllowedTools = (
    avatar: Avatar,
    allowedAgenticToolIds: string[] | undefined
  ) => {
    commitAvatarUpdates(
      new Map([
        [
          avatar.id,
          {
            ...avatar,
            allowedAgenticToolIds,
          },
        ],
      ])
    );
  };

  const setAllowMode = (avatar: Avatar, mode: ToolAllowMode) => {
    if (mode === "default") {
      updateAllowedTools(avatar, undefined);
      return;
    }
    if (mode === "none") {
      updateAllowedTools(avatar, []);
      return;
    }
    updateAllowedTools(
      avatar,
      avatar.allowedAgenticToolIds && avatar.allowedAgenticToolIds.length > 0
        ? avatar.allowedAgenticToolIds
        : nonGroupToolIds
    );
  };

  const setToolAllowed = (avatar: Avatar, toolId: string, checked: boolean) => {
    const current = new Set(avatar.allowedAgenticToolIds ?? []);
    if (checked) current.add(toolId);
    else current.delete(toolId);
    updateAllowedTools(avatar, Array.from(current));
  };

  const renderAssignmentControl = (
    tag: string,
    label: string,
    currentAvatarId: string | undefined
  ) => {
    const current = currentAvatarId ?? "";
    const draft = assignmentDrafts[tag] ?? current;
    return (
      <div className="stewardship-assignment-control">
        <select
          className="stewardship-select stewardship-assignment-select"
          value={draft}
          onChange={(e) =>
            setAssignmentDrafts((prev) => ({ ...prev, [tag]: e.target.value }))
          }
          aria-label={`Choose owner for ${label}`}
        >
          <option value="">{current ? "Unassign" : "Choose avatar..."}</option>
          {fullAvatarCatalog.map((avatar) => (
            <option key={avatar.id} value={avatar.id}>
              {displayName(avatar)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="stewardship-assign-btn"
          disabled={draft === current}
          onClick={() => assignSingleTag(tag, draft)}
        >
          {current ? "Apply" : "Assign"}
        </button>
      </div>
    );
  };

  const renderAllowlistCard = (avatar: Avatar) => {
    const mode = allowMode(avatar);
    const allowed = new Set(avatar.allowedAgenticToolIds ?? []);
    return (
      <article key={avatar.id} className="stewardship-allowlist-card">
        <div className="stewardship-allowlist-card-head">
          <strong>{avatar.givenName}</strong>
          <span className="tool-workshop-hint">{avatar.id}</span>
        </div>
        <label className="stewardship-mode-label">
          Tool mode
          <select
            className="stewardship-select"
            value={mode}
            onChange={(e) =>
              setAllowMode(avatar, e.target.value as ToolAllowMode)
            }
          >
            <option value="custom">Custom allowlist</option>
            <option value="default">Default general tools</option>
            <option value="none">No JSON tools</option>
          </select>
        </label>
        {mode === "custom" && (
          <div
            className="stewardship-tool-checks"
            aria-label={`${avatar.givenName} tool allowlist`}
          >
            {AGENTIC_TOOL_IDS.map((toolId) => (
              <label key={toolId} className="tool-workshop-check">
                <input
                  type="checkbox"
                  checked={allowed.has(toolId)}
                  onChange={(e) =>
                    setToolAllowed(avatar, toolId, e.target.checked)
                  }
                />
                <span className="tool-workshop-label-block">
                  <span>{toolCapabilityLabel(toolId)}</span>
                  <span className="tool-workshop-hint">{toolId}</span>
                </span>
              </label>
            ))}
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="stewardship-workshop tool-workshop-panel">
      <header className="tool-workshop-header">
        <h2 className="tool-workshop-title">Stewardship</h2>
        <p className="tool-workshop-sub">
          Assign operational stewardships and tool capabilities without editing raw
          system tags.
        </p>
      </header>

      <section className="tool-workshop-section">
        <h3>Stewardships</h3>
        <p className="tool-workshop-hint">
          Stewardships are monitor duties. Required rows warn in chat when no avatar
          owns them.
        </p>
        <table className="tool-workshop-table stewardship-workshop-table">
          <thead>
            <tr>
              <th>Duty</th>
              <th>Required</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Assign</th>
            </tr>
          </thead>
          <tbody>
            {stewardshipRows.map((row) => (
              <tr key={row.name}>
                <td>
                  <strong>{row.label}</strong>
                  {row.description && (
                    <div className="tool-workshop-hint">{row.description}</div>
                  )}
                </td>
                <td>{row.required ? "Yes" : "Optional"}</td>
                <td>{joinClaimants(row.claimants)}</td>
                <td>
                  <span className={`stewardship-status is-${row.status}`}>
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td>
                  {renderAssignmentControl(
                    row.tag,
                    row.label,
                    row.claimants[0]?.id
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="tool-workshop-section">
        <h3>Capability Owners</h3>
        <p className="tool-workshop-hint">
          Capability ownership grants grouped tools. Individual allowlists below
          still control which tool protocol an avatar is asked to use.
        </p>
        <table className="tool-workshop-table stewardship-workshop-table">
          <thead>
            <tr>
              <th>Capability</th>
              <th>Tools</th>
              <th>Owner</th>
              <th>Status</th>
              <th>Assign</th>
            </tr>
          </thead>
          <tbody>
            {capabilityGroupRows.map((row) => (
              <tr key={row.group}>
                <td>
                  <strong>{capabilityGroupLabel(row.group)}</strong>
                </td>
                <td>{row.toolIds.map(toolCapabilityLabel).join(", ")}</td>
                <td>{joinClaimants(row.claimants)}</td>
                <td>
                  <span className={`stewardship-status is-${row.status}`}>
                    {statusLabel(row.status)}
                  </span>
                </td>
                <td>
                  {renderAssignmentControl(
                    row.tag,
                    row.label,
                    row.claimants[0]?.id
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="tool-workshop-section">
        <h3>Individual Tool Allowlists</h3>
        <p className="tool-workshop-hint">
          Default general tools means the avatar may use registered non-group tools
          without a custom allowlist. Grouped tools still need the matching
          capability owner above.
        </p>
        <div className="stewardship-default-tools">
          <strong>Included in Default general tools:</strong>{" "}
          {nonGroupToolIds.map((toolId) => (
            <span key={toolId} className="stewardship-default-tool">
              {toolCapabilityLabel(toolId)}
            </span>
          ))}
        </div>
        <div className="stewardship-allowlist-groups">
          {avatarsByAllowMode.map((group) => (
            <section key={group.id} className="stewardship-allowlist-group">
              <div className="stewardship-allowlist-group-head">
                <h4>{group.title}</h4>
                <span className="stewardship-group-count">
                  {group.avatars.length}
                </span>
              </div>
              <p className="tool-workshop-hint">{group.subtitle}</p>
              {group.avatars.length > 0 ? (
                <div className="stewardship-allowlist">
                  {group.avatars.map(renderAllowlistCard)}
                </div>
              ) : (
                <p className="tool-workshop-empty">No avatars in this group.</p>
              )}
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}
