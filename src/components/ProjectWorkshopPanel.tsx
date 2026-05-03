import { useAppContentView } from "../app/appContentViewContext";

function ProjectTaskNest({ projectId }: { projectId: string }) {
  const m = useAppContentView();
  const list = m.platformTasksByProjectId[projectId];
  if (!list?.length) return null;
  const projectTitle =
    m.contextProjectTitleById[projectId] ?? projectId;
  return (
    <ul
      className="wm-project-task-list wm-project-task-list--actions"
      aria-label="Platform tasks for this project"
    >
      {list.map((t) => {
        const terminal = t.status === "done" || t.status === "cancelled";
        const focused = m.focus.task?.id === t.id;
        const canExecute = t.requiredCapability?.id === "avatar_creation";
        if (terminal) {
          return (
            <li key={t.id} className="wm-project-task-item wm-project-task-item--terminal">
              <span className="wm-project-task-title">{t.title}</span>
              <span className="wm-project-task-meta">
                {projectTitle} · {t.workflowStatus} · {t.status}
              </span>
            </li>
          );
        }
        return (
          <li
            key={t.id}
            className={`context-task-item wm-project-nested-task ${focused ? "focused" : ""}`}
          >
            <div className="context-task-main">
              <button
                type="button"
                className="context-task-title"
                onClick={() => m.focusPlatformTask(t.id)}
              >
                {t.title}
              </button>
              <span className="context-task-meta">
                {projectTitle} · {t.workflowStatus ?? t.status}
                {t.requiredCapability
                  ? ` · needs ${t.requiredCapability.id}`
                  : ""}
              </span>
              {t.notes && (
                <span className="context-task-notes">
                  {t.notes.replace(/\s+/g, " ").slice(0, 160)}
                  {t.notes.length > 160 ? "…" : ""}
                </span>
              )}
            </div>
            <div className="context-task-actions">
              <button type="button" onClick={() => m.focusPlatformTask(t.id)}>
                Focus
              </button>
              <button
                type="button"
                disabled={!canExecute}
                title={
                  canExecute
                    ? "Post the avatar creation offer for this task"
                    : "No executor yet for this task type"
                }
                onClick={() => m.executePlatformTask(t.id)}
              >
                Execute
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Cancel task "${t.title}"?`)) {
                    m.cancelPlatformTask(t.id);
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * World metadata projects — same capabilities as the former Context → Projects tab.
 */
export function ProjectWorkshopPanel() {
  const m = useAppContentView();
  const depthMap = m.situationContext.contextEntryDepth ?? {};
  const t = depthMap.projects ?? 0;

  return (
    <div className="project-workshop-panel">
      <header className="tool-workshop-header">
        <h2 className="tool-workshop-title">Projects</h2>
        <p className="tool-workshop-sub">
          Merges world-metadata titles with <strong>platform</strong> projects (e.g.
          Build set). Platform tasks are listed under each project when present.
          Previously under Context → Projects.
        </p>
      </header>
      <div className="context-projects">
        <p className="context-projects-hint">
          For context scoring and execution; nested rows are durable platform tasks
          (Focus / Execute / Cancel match the Context → Tasks tab).
        </p>
        <div className="context-projects-add">
          <input
            type="text"
            className="context-projects-title-input"
            placeholder="Project title…"
            value={m.newProjectTitle}
            onChange={(e) => m.setNewProjectTitle(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), m.handleAddWorldProject())
            }
            aria-label="New project title"
          />
          <textarea
            className="context-projects-notes-input"
            placeholder="Summary for prompts (optional)"
            value={m.newProjectSummary}
            onChange={(e) => m.setNewProjectSummary(e.target.value)}
            rows={2}
            aria-label="New project summary"
          />
          <textarea
            className="context-projects-notes-input"
            placeholder="Notes (optional)"
            value={m.newProjectNotes}
            onChange={(e) => m.setNewProjectNotes(e.target.value)}
            rows={2}
            aria-label="New project notes"
          />
          <button
            type="button"
            className="context-projects-add-btn"
            onClick={m.handleAddWorldProject}
            disabled={!m.newProjectTitle.trim()}
          >
            Add project
          </button>
        </div>
        {m.projectsList.length === 0 ? (
          <p className="context-empty">No projects yet.</p>
        ) : (
          <ul className="wm-project-list">
            {m.projectsList.map(([id, proj]) => (
              <li
                key={id}
                className={`wm-project-item ${
                  m.focus.project?.id === id ? "focused" : ""
                }`}
              >
                <div className="wm-project-item-main">
                  <button
                    type="button"
                    className="wm-project-select"
                    onClick={() => m.focusWorldOrPlatformProject(id, proj.title)}
                    aria-label={`Set focus to project ${proj.title}`}
                  >
                    <span className="wm-project-title">{proj.title}</span>
                    {proj.summary?.trim() && (
                      <span className="wm-project-summary">{proj.summary.trim()}</span>
                    )}
                    {proj.notes?.trim() && (
                      <span className="wm-project-notes">{proj.notes.trim()}</span>
                    )}
                  </button>
                  <ProjectTaskNest projectId={id} />
                  <div className="context-task-actions wm-project-project-actions">
                    <button
                      type="button"
                      onClick={() => m.focusWorldOrPlatformProject(id, proj.title)}
                    >
                      Focus
                    </button>
                    <button
                      type="button"
                      onClick={() => m.cancelProjectEliminate(id, proj.title)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={!m.canCompletePlatformProject(id)}
                      title={
                        m.canCompletePlatformProject(id)
                          ? "Mark project successful (completed)"
                          : "Complete when every platform task is done, or when there are no tasks"
                      }
                      onClick={() => m.completeProjectSuccess(id)}
                    >
                      Complete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {m.completedProjectsList.length > 0 && (
          <div className="context-projects-completed">
            <h3 className="context-projects-completed-title">Completed projects</h3>
            <ul className="wm-project-list wm-project-list--completed">
              {m.completedProjectsList.map(([id, proj]) => (
                <li
                  key={id}
                  className={`wm-project-item wm-project-item--completed ${
                    m.focus.project?.id === id ? "focused" : ""
                  }`}
                >
                  <div className="wm-project-item-main">
                    <button
                      type="button"
                      className="wm-project-select"
                      onClick={() => m.focusWorldOrPlatformProject(id, proj.title)}
                      aria-label={`Set focus to project ${proj.title}`}
                    >
                      <span className="wm-project-title">{proj.title}</span>
                      {proj.summary?.trim() && (
                        <span className="wm-project-summary">{proj.summary.trim()}</span>
                      )}
                    </button>
                    <ProjectTaskNest projectId={id} />
                    <div className="context-task-actions wm-project-project-actions">
                      <button
                        type="button"
                        onClick={() => m.focusWorldOrPlatformProject(id, proj.title)}
                      >
                        Focus
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          m.cancelProjectEliminate(id, proj.title, {
                            variant: "remove",
                          })
                        }
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="context-entry-depth">
        <div className="context-entry-depth-row">
          <span className="context-entry-depth-title">Context depth (projects)</span>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(t * 1000)}
            onChange={(e) =>
              m.patchSituationContext({
                contextEntryDepth: {
                  ...depthMap,
                  projects: Number(e.target.value) / 1000,
                },
              })
            }
            aria-label="Context depth (projects)"
            className="context-entry-depth-slider"
          />
          <output className="context-entry-depth-readout" aria-live="polite">
            {m.contextEntryBudgets.projectExtraTopK} extra
          </output>
        </div>
      </div>
    </div>
  );
}
