import { useAppContentView } from "../app/appContentViewContext";

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
          Local shared metadata (this browser). Used for chat context, tasks, and
          linking <strong>Unmet Needs</strong>. Previously under Context → Projects.
        </p>
      </header>
      <div className="context-projects">
        <p className="context-projects-hint">
          For future project execution and context scoring.
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
                <button
                  type="button"
                  className="wm-project-select"
                  onClick={() =>
                    m.setFocus((f) => ({
                      ...f,
                      project: { id, title: proj.title },
                    }))
                  }
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
                <button
                  type="button"
                  className="wm-project-remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    m.handleRemoveWorldProject(id);
                  }}
                  aria-label={`Remove ${proj.title}`}
                  title="Remove from list"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
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
