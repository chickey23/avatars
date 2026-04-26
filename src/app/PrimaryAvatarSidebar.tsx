import { getProjectAssignmentsForAvatar } from "../services/longTermTasks";
import {
  getAvatarPortraitObjectPosition,
  getAvatarPortraitSrc,
  getAvatarPortraitTransform,
} from "../services/avatarPortrait";
import { AiRulesLibraryPanel } from "../components/AiRulesLibraryPanel";
import { PERSONALITY_TRAITS } from "../theme/designTokens";
import { getAvatarOperationalRoles } from "../services/avatarOperations";
import { useAppContentView } from "./appContentViewContext";
import { useAudioVisualPulse } from "./audioVisualPulseContext";
import type { AvatarDetailTabId } from "./useAppContentModel";

const AVATAR_DETAIL_TABS: ReadonlyArray<{ id: AvatarDetailTabId; label: string }> = [
  { id: "match", label: "Match" },
  { id: "bio", label: "Bio" },
  { id: "rules", label: "Rules" },
];

export function PrimaryAvatarSidebar() {
  const m = useAppContentView();
  const audioPulse = useAudioVisualPulse();
  const renderAvatarDetailPanel = (
    avatar: (typeof m.fullAvatarCatalog)[number],
    portraitSrc: string | undefined,
    portraitInitial: string
  ) => {
    const detailProjects = getProjectAssignmentsForAvatar(
      avatar.id,
      avatar.assignedTasks
    );
    const operationalRoles = getAvatarOperationalRoles(avatar);
    const hasOperationalRoles =
      operationalRoles.stewardships.length > 0 ||
      operationalRoles.capabilities.length > 0;

    return (
      <div className="avatar-detail-panel">
        {!portraitSrc && (
          <section className="avatar-detail-section">
            <h4 className="avatar-detail-section-label">Portrait</h4>
            <div className="avatar-portrait-row">
              <span
                className="avatar-portrait avatar-portrait--large"
                aria-hidden="true"
              >
                <span
                  className="avatar-portrait-fallback"
                  style={{
                    background:
                      avatar.appearance?.accentColor ?? "rgba(120,120,140,0.5)",
                  }}
                >
                  {portraitInitial}
                </span>
              </span>
              <div className="avatar-portrait-actions">
                <button
                  type="button"
                  className="avatar-portrait-choose"
                  aria-label={`Choose portrait image for ${avatar.givenName}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    m.openPortraitFilePicker(avatar.id);
                  }}
                >
                  Choose image…
                </button>
              </div>
            </div>
            {m.portraitFileError?.avatarId === avatar.id && (
              <p className="avatar-portrait-error" role="status">
                {m.portraitFileError.message}
              </p>
            )}
          </section>
        )}
        <div
          className="avatar-detail-tabs"
          role="tablist"
          aria-label={`${avatar.givenName} detail sections`}
        >
          {AVATAR_DETAIL_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`avatar-detail-tab${
                m.avatarDetailActiveTab === tab.id ? " is-active" : ""
              }`}
              role="tab"
              id={`avatar-detail-tab-${avatar.id}-${tab.id}`}
              aria-selected={m.avatarDetailActiveTab === tab.id}
              aria-controls={`avatar-detail-panel-${avatar.id}-${tab.id}`}
              onClick={(e) => {
                e.stopPropagation();
                m.setAvatarDetailActiveTab(tab.id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {m.avatarDetailActiveTab === "match" && (
          <div
            id={`avatar-detail-panel-${avatar.id}-match`}
            className="avatar-detail-tab-panel"
            role="tabpanel"
            aria-labelledby={`avatar-detail-tab-${avatar.id}-match`}
          >
            <section className="avatar-detail-section">
              <h4 className="avatar-detail-section-label">
                Assigned projects{" "}
                <span className="avatar-detail-section-hint">
                  (for match and response)
                </span>
              </h4>
              {detailProjects.length > 0 ? (
                <ul className="avatar-detail-task-list">
                  {detailProjects.map((t) => (
                    <li
                      key={t.projectId ?? t.id}
                      title={t.description ?? undefined}
                    >
                      {t.title}
                    </li>
                  ))}
                </ul>
              ) : (
                <span className="avatar-detail-empty">None</span>
              )}
            </section>
            <section className="avatar-detail-section">
              <h4 className="avatar-detail-section-label">
                Tags <span className="avatar-detail-section-hint">(for match)</span>
              </h4>
              {avatar.tags.length > 0 ? (
                <div
                  className="avatar-trait-chips avatar-trait-chips--meta"
                  aria-label="Tags"
                >
                  {avatar.tags.map((tag) => (
                    <span key={tag} className="avatar-trait-chip">
                      {tag}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="avatar-detail-empty">None</span>
              )}
            </section>
            <section className="avatar-detail-section">
              <h4 className="avatar-detail-section-label">
                Interests{" "}
                <span className="avatar-detail-section-hint">(for match)</span>
              </h4>
              {avatar.interests.length > 0 ? (
                <div
                  className="avatar-trait-chips avatar-trait-chips--meta"
                  aria-label="Interests"
                >
                  {avatar.interests.map((interest) => (
                    <span key={interest} className="avatar-trait-chip">
                      {interest}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="avatar-detail-empty">None</span>
              )}
            </section>
          </div>
        )}
        {m.avatarDetailActiveTab === "bio" && (
          <div
            id={`avatar-detail-panel-${avatar.id}-bio`}
            className="avatar-detail-tab-panel"
            role="tabpanel"
            aria-labelledby={`avatar-detail-tab-${avatar.id}-bio`}
          >
            <section className="avatar-detail-section">
              <h4 className="avatar-detail-section-label">
                Description{" "}
                <span className="avatar-detail-section-hint">(for response)</span>
              </h4>
              <p className="avatar-desc">{avatar.description}</p>
            </section>
            <section className="avatar-detail-section">
              <h4 className="avatar-detail-section-label">
                Personality description{" "}
                <span className="avatar-detail-section-hint">(for response)</span>
              </h4>
              <p className="avatar-personality">{avatar.personality}</p>
            </section>
          </div>
        )}
        {m.avatarDetailActiveTab === "rules" && (
          <div
            id={`avatar-detail-panel-${avatar.id}-rules`}
            className="avatar-detail-tab-panel"
            role="tabpanel"
            aria-labelledby={`avatar-detail-tab-${avatar.id}-rules`}
          >
            <section className="avatar-detail-section">
              <h4 className="avatar-detail-section-label">
                Traits{" "}
                <span className="avatar-detail-section-hint">(for response)</span>
              </h4>
              {avatar.traitIds && avatar.traitIds.length > 0 ? (
                <div
                  className="avatar-trait-chips"
                  aria-label="Personality traits"
                >
                  {avatar.traitIds.map((tid) => (
                    <span key={tid} className="avatar-trait-chip">
                      {PERSONALITY_TRAITS.find((t) => t.id === tid)?.label ?? tid}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="avatar-detail-empty">None</span>
              )}
            </section>
            <section className="avatar-detail-section">
              <h4 className="avatar-detail-section-label">
                Stewardships{" "}
                <span className="avatar-detail-section-hint">(operational duties)</span>
              </h4>
              {operationalRoles.stewardships.length > 0 ? (
                <div
                  className="avatar-trait-chips avatar-trait-chips--meta"
                  aria-label="Stewardships"
                >
                  {operationalRoles.stewardships.map((role) => (
                    <span
                      key={role.tag}
                      className="avatar-trait-chip"
                      title={role.description}
                    >
                      {role.label}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="avatar-detail-empty">None</span>
              )}
            </section>
            <section className="avatar-detail-section">
              <h4 className="avatar-detail-section-label">
                Capabilities{" "}
                <span className="avatar-detail-section-hint">(tool access)</span>
              </h4>
              {operationalRoles.capabilities.length > 0 ? (
                <div
                  className="avatar-trait-chips avatar-trait-chips--meta"
                  aria-label="Capabilities"
                >
                  {operationalRoles.capabilities.map((role) => (
                    <span
                      key={`${role.kind}:${role.id}`}
                      className="avatar-trait-chip"
                      title={role.description}
                    >
                      {role.label}
                    </span>
                  ))}
                </div>
              ) : hasOperationalRoles ? (
                <span className="avatar-detail-empty">None</span>
              ) : (
                <span className="avatar-detail-empty">No operational roles.</span>
              )}
            </section>
          </div>
        )}
        {!avatar.uneditable && (
          <section className="avatar-detail-section avatar-detail-section--builder">
            <button
              type="button"
              className="avatar-detail-edit-builder"
              onClick={(e) => {
                e.stopPropagation();
                m.setAvatarBuilderInitial({ kind: "edit", avatar: { ...avatar } });
                m.setAvatarBuilderOpen(true);
              }}
            >
              Edit in builder…
            </button>
          </section>
        )}
      </div>
    );
  };

  return (
      <aside className="avatar-sidebar">
        <input
          ref={m.portraitFileInputRef}
          type="file"
          accept="image/*"
          className="avatar-portrait-file-input"
          aria-hidden
          tabIndex={-1}
          onChange={m.handlePortraitFileChange}
        />
        <div className="avatar-sidebar-heading">
          <h2>Primary Avatars</h2>
          <div className="avatar-sidebar-heading-tools">
            {m.maxPrimarySlotOptions > 0 && (
              <div className="avatar-roster-size">
                <select
                  className="avatar-roster-size-select"
                  aria-label="Number of primary avatar slots shown in the sidebar"
                  value={m.effectivePrimarySlots}
                  onChange={(e) =>
                    m.patchSituationContext({
                      primaryAvatarSlotCount: Number(e.target.value),
                    })
                  }
                >
                  {Array.from({ length: m.maxPrimarySlotOptions }, (_, i) => i + 1).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}
            {m.selectedAvatarIds.length > 0 && (
              <button
                type="button"
                className="avatar-clear-selection"
                aria-label="Use automatic routing for all chat m.messages. Clears targeted avatar selection."
                title="Use switchboard routing instead of only the selected avatars"
                onClick={() => m.clearAvatarSelection()}
              >
                ALL CHAT
              </button>
            )}
            <button
              type="button"
              className={`avatar-detail-toggle behavior-panel-gear${
                m.behaviorPanelOpen ? " behavior-panel-gear--open" : ""
              }`}
              aria-expanded={m.behaviorPanelOpen}
              aria-controls="behavior-tuning-panel"
              title="Behavior — proactive notifications and reply balance"
              aria-label={
                m.behaviorPanelOpen ? "Close behavior settings" : "Open behavior settings"
              }
              onClick={() => m.setBehaviorPanelOpen((o) => !o)}
            >
              <span className="avatar-detail-toggle-icon" aria-hidden>
                &#9881;
              </span>
            </button>
          </div>
        </div>
        {m.behaviorPanelOpen && (
          <div
            id="behavior-tuning-panel"
            className="behavior-tuning-panel behavior-tuning-panel--dropdown"
            role="region"
            aria-label="Behavior"
          >
            <h3 className="behavior-tuning-title">Behavior</h3>
            <p className="behavior-tuning-hint">
              Proactive email notifications and reply balance (saved with your session).
            </p>
            <label className="tuning-row">
              <span className="tuning-label">
                Proactive min score <output>{m.proactiveMinCombined}</output>
              </span>
              <input
                type="range"
                min={35}
                max={75}
                value={m.proactiveMinCombined}
                onChange={(e) =>
                  m.patchBehaviorTuning({
                    proactiveMinCombinedScore: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="tuning-row">
              <span className="tuning-label">
                Extra avatar affinity <output>{m.proactiveMinAffinity}</output>
              </span>
              <input
                type="range"
                min={0}
                max={25}
                value={m.proactiveMinAffinity}
                onChange={(e) =>
                  m.patchBehaviorTuning({
                    proactiveMinAffinityBonus: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className="tuning-row">
              <span className="tuning-label">
                Reply: 0 persona · 100 context <output>{m.replyContextFocus}</output>
              </span>
              <input
                type="range"
                min={0}
                max={100}
                value={m.replyContextFocus}
                onChange={(e) =>
                  m.patchBehaviorTuning({
                    replyContextFocus: Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
        )}
        {m.avatars.map((avatar, rosterIndex) => {
          const portraitSrc = getAvatarPortraitSrc(
            m.situationContext.avatarPortraitSrcById,
            avatar.id,
            avatar.appearance?.portraitUrl
          );
          const portraitObjectPosition = getAvatarPortraitObjectPosition(
            m.situationContext.avatarPortraitPositionById?.[avatar.id]
          );
          const portraitTransform = getAvatarPortraitTransform(
            m.situationContext.avatarPortraitScaleById?.[avatar.id]
          );
          const portraitInitial =
            avatar.givenName.trim().charAt(0).toUpperCase() || "?";
          const pendList = m.pendingByAvatar.get(avatar.id);
          const pendCount = pendList?.length ?? 0;
          const firstPending = pendList?.[0];
          return (
            <div
              key={avatar.id}
              className={`avatar-card ${
                m.selectedAvatarIds.includes(avatar.id) ? "selected" : ""
              }${m.executorAvatarId === avatar.id ? " is-executor" : ""}${
                (audioPulse?.anchor === "avatar" ||
                  audioPulse?.anchor === "switchboard") &&
                audioPulse.avatarId === avatar.id
                  ? " audio-visual-cue-active"
                  : ""
              }`}
            >
              <div className="avatar-card-row avatar-card-row--top">
                <div
                  className="avatar-roster-reorder"
                  role="group"
                  aria-label="Roster order"
                >
                  <button
                    type="button"
                    className="avatar-roster-reorder-btn"
                    disabled={rosterIndex <= 0}
                    title="Move up in roster priority"
                    aria-label={`Move ${avatar.givenName} up in roster`}
                    onClick={() => m.handleMoveCoreRoster(avatar.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="avatar-roster-reorder-btn"
                    disabled={rosterIndex >= m.avatars.length - 1}
                    title="Move down in roster priority"
                    aria-label={`Move ${avatar.givenName} down in roster`}
                    onClick={() => m.handleMoveCoreRoster(avatar.id, 1)}
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  className="avatar-card-select"
                  onClick={() => m.toggleAvatarSelection(avatar.id)}
                >
                  <span className="avatar-portrait" aria-hidden="true">
                    {portraitSrc ? (
                      <img
                        src={portraitSrc}
                        alt=""
                        className="avatar-portrait-img"
                        style={{
                          objectPosition: portraitObjectPosition,
                          transform: portraitTransform,
                          transformOrigin: portraitObjectPosition,
                        }}
                      />
                    ) : (
                      <span
                        className="avatar-portrait-fallback"
                        style={{
                          background:
                            avatar.appearance?.accentColor ?? "rgba(120,120,140,0.5)",
                        }}
                      >
                        {portraitInitial}
                      </span>
                    )}
                  </span>
                  <span className="avatar-name">{avatar.givenName}</span>
                </button>
                <div className="avatar-card-toolbar">
                  {pendCount > 0 && (
                    <button
                      type="button"
                      className={`avatar-pending-badge ${
                        m.avatarPendingListOpenId === avatar.id ? "is-open" : ""
                      }`}
                      title="Show pending topics for this avatar"
                      aria-label={`${pendCount} pending notifications`}
                      aria-expanded={m.avatarPendingListOpenId === avatar.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        m.setAvatarPendingListOpenId((id) =>
                          id === avatar.id ? null : avatar.id
                        );
                        m.setAvatarDetailExpandedId(null);
                      }}
                    >
                      {pendCount}
                    </button>
                  )}
                  <button
                    type="button"
                    className="avatar-detail-toggle"
                    title="Avatar details"
                    aria-label="Show avatar details"
                    aria-expanded={m.avatarDetailExpandedId === avatar.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      m.setAvatarDetailExpandedId((id) =>
                        id === avatar.id ? null : avatar.id
                      );
                      m.setAvatarPendingListOpenId(null);
                    }}
                  >
                    <span className="avatar-detail-toggle-icon" aria-hidden>
                      &#128269;
                    </span>
                  </button>
                </div>
              </div>
              <span className="avatar-appellation">{avatar.appellation}</span>
              {firstPending && (
                <p
                  className="avatar-pending-line"
                  title={firstPending.topicSummary}
                >
                  {firstPending.topicSummary.length > 72
                    ? `${firstPending.topicSummary.slice(0, 72).trim()}…`
                    : firstPending.topicSummary}
                </p>
              )}
              {m.avatarPendingListOpenId === avatar.id && pendList && pendList.length > 0 && (
                <ul className="avatar-pending-list" aria-label="Pending topics">
                  {pendList.map((p) => (
                    <li key={p.id} className="avatar-pending-item">
                      <span className="avatar-pending-item-text">{p.topicSummary}</span>
                      <span className="avatar-pending-item-actions">
                        <button
                          type="button"
                          className="avatar-pending-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            m.setSelectedAvatarIds([avatar.id]);
                            void m.sendMessage(
                              `Let's discuss this now: ${p.topicSummary}`,
                              m.focus,
                              {
                                releasedClusterIds: [p.topicClusterId],
                                primaryAvatarId: avatar.id,
                              }
                            );
                            m.setAvatarPendingListOpenId(null);
                          }}
                        >
                          Discuss
                        </button>
                        <button
                          type="button"
                          className="avatar-pending-action avatar-pending-action--muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            m.patchSituationContext({
                              pendingNotifications: (
                                m.situationContext.pendingNotifications ?? []
                              ).filter((n) => n.id !== p.id),
                            });
                          }}
                        >
                          Dismiss
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {m.avatarDetailExpandedId === avatar.id &&
                renderAvatarDetailPanel(avatar, portraitSrc, portraitInitial)}
            </div>
          );
        })}
        {m.popUpAvatarIds.length > 0 && (
          <div
            className="avatar-popin-panel avatar-popup-panel"
            role="region"
            aria-label="Pop-up avatars"
          >
            <h3 className="avatar-popin-title">Pop-up avatars</h3>
            <p className="avatar-popin-hint">
              Selected via Talk to but not in the primary lineup. Click to remove.
            </p>
            <ul className="avatar-popin-list">
              {m.popUpAvatarIds.map((id) => {
                const a = m.fullAvatarCatalog.find((x) => x.id === id);
                if (!a) return null;
                const src = getAvatarPortraitSrc(
                  m.situationContext.avatarPortraitSrcById,
                  a.id,
                  a.appearance?.portraitUrl
                );
                const objectPosition = getAvatarPortraitObjectPosition(
                  m.situationContext.avatarPortraitPositionById?.[a.id]
                );
                const transform = getAvatarPortraitTransform(
                  m.situationContext.avatarPortraitScaleById?.[a.id]
                );
                const initial = a.givenName.trim().charAt(0).toUpperCase() || "?";
                return (
                  <li key={id}>
                    <div className="avatar-popup-row">
                      <button
                        type="button"
                        className="avatar-popin-card avatar-popup-card"
                        aria-label={`Remove ${a.givenName} from Talk to selection`}
                        onClick={() => m.toggleAvatarSelection(id)}
                      >
                        <span className="avatar-portrait avatar-portrait--sm" aria-hidden>
                          {src ? (
                            <img
                              src={src}
                              alt=""
                              className="avatar-portrait-img"
                              style={{
                                objectPosition,
                                transform,
                                transformOrigin: objectPosition,
                              }}
                            />
                          ) : (
                            <span
                              className="avatar-portrait-fallback"
                              style={{
                                background:
                                  a.appearance?.accentColor ?? "rgba(120,120,140,0.5)",
                              }}
                            >
                              {initial}
                            </span>
                          )}
                        </span>
                        <span className="avatar-popin-name">{a.givenName}</span>
                      </button>
                      <button
                        type="button"
                        className="avatar-detail-toggle avatar-popup-detail-toggle"
                        title="Avatar details"
                        aria-label={`Show ${a.givenName} details`}
                        aria-expanded={m.avatarDetailExpandedId === a.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          m.setAvatarDetailExpandedId((expandedId) =>
                            expandedId === a.id ? null : a.id
                          );
                          m.setAvatarPendingListOpenId(null);
                        }}
                      >
                        <span className="avatar-detail-toggle-icon" aria-hidden>
                          &#128269;
                        </span>
                      </button>
                    </div>
                    {m.avatarDetailExpandedId === a.id &&
                      renderAvatarDetailPanel(a, src, initial)}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {m.situationContext.userFocus?.project?.id && m.popInAvatarIds.length > 0 && (
          <div className="avatar-popin-panel" role="region" aria-label="Project pop-in avatars">
            <h3 className="avatar-popin-title">Project team</h3>
            <p className="avatar-popin-hint">
              Managed avatars for this focus. Click to set executor (+1 roster once per focus per
              avatar).
            </p>
            <ul className="avatar-popin-list">
              {m.popInAvatarIds.map((id) => {
                const a = m.fullAvatarCatalog.find((x) => x.id === id);
                if (!a) return null;
                const src = getAvatarPortraitSrc(
                  m.situationContext.avatarPortraitSrcById,
                  a.id,
                  a.appearance?.portraitUrl
                );
                const objectPosition = getAvatarPortraitObjectPosition(
                  m.situationContext.avatarPortraitPositionById?.[a.id]
                );
                const transform = getAvatarPortraitTransform(
                  m.situationContext.avatarPortraitScaleById?.[a.id]
                );
                const initial = a.givenName.trim().charAt(0).toUpperCase() || "?";
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={`avatar-popin-card${
                        m.situationContext.executorOverrideAvatarId === id ? " is-override" : ""
                      }`}
                      onClick={() => m.handlePopInAvatarClick(id)}
                    >
                      <span className="avatar-portrait avatar-portrait--sm" aria-hidden>
                        {src ? (
                          <img
                            src={src}
                            alt=""
                            className="avatar-portrait-img"
                            style={{
                              objectPosition,
                              transform,
                              transformOrigin: objectPosition,
                            }}
                          />
                        ) : (
                          <span
                            className="avatar-portrait-fallback"
                            style={{
                              background:
                                a.appearance?.accentColor ?? "rgba(120,120,140,0.5)",
                            }}
                          >
                            {initial}
                          </span>
                        )}
                      </span>
                      <span className="avatar-popin-name">{a.givenName}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <details className="task-assign-details">
          <summary className="task-assign-summary">
            {m.taskAssignAvatar
              ? `Assign project · ${m.taskAssignAvatar.givenName}`
              : "Assign project"}
            {m.tasks.length > 0 ? (
              <span className="task-assign-count" aria-hidden>
                {" "}
                ({m.tasks.length})
              </span>
            ) : null}
          </summary>
          <div className="task-assign-body">
            {!m.firstSelectedId && (
              <p className="task-assign-hint">Select an avatar to assign a project.</p>
            )}
            <div className="task-input-row">
              <select
                className="task-project-select"
                value={m.taskProjectId}
                onChange={(e) => m.setTaskProjectId(e.target.value)}
                disabled={!m.firstSelectedId || m.projectsList.length === 0}
                aria-label="Project to assign"
              >
                <option value="">
                  {m.projectsList.length === 0
                    ? "Add projects under Workshops → Projects"
                    : "Choose a project…"}
                </option>
                {m.projectsList.map(([id, proj]) => (
                  <option key={id} value={id}>
                    {proj.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={m.handleAssignTask}
                disabled={!m.taskProjectId || !m.firstSelectedId}
              >
                Add
              </button>
            </div>
            {m.taskAssignStatus && (
              <p
                className={`task-assign-status task-assign-status--${m.taskAssignStatus.kind}`}
                role={m.taskAssignStatus.kind === "warn" ? "alert" : "status"}
              >
                {m.taskAssignStatus.text}
              </p>
            )}
            {m.tasks.length > 0 && (
              <ul className="task-list">
                {m.tasks.map((t) => (
                  <li key={t.id}>{t.title}</li>
                ))}
              </ul>
            )}
          </div>
        </details>
        <AiRulesLibraryPanel />
      </aside>
  );
}
