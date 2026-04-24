import { useAppContentView } from "./appContentViewContext";
import { InternetSearchPanel } from "../components/InternetSearchPanel";
import { appendSessionLog } from "../services/sessionLog";
import { peekEmailInsight } from "../services/emailInsights";
import { applyWorldviewAuditRevert } from "../services/worldviewAudit";
import { internetContextLineDisplayTitle } from "../services/internetContextLines";

export function ContextPanel() {
  const m = useAppContentView();

  return (
      <aside className="context-panel">
        <h2>Context</h2>
        <div className="context-connect">
          {!m.gmailConnected ? (
            <>
              <button
                type="button"
                className="connection-btn"
                onClick={m.handleConnectGmail}
                disabled={m.gmailConnecting || !m.gmailHasCreds}
              >
                {m.gmailConnecting ? "Connecting..." : "Connect Gmail"}
              </button>
              {!m.gmailHasCreds && m.gmailCredsPath && (
                <p className="context-setup-hint" title={m.gmailCredsPath}>
                  Set up credentials at: {m.gmailCredsPath}
                </p>
              )}
            </>
          ) : (
            <button
              type="button"
              className="connection-btn connection-btn-secondary"
              onClick={m.handleConnectGmail}
              disabled={m.gmailConnecting}
              title="Reconnect to refresh tokens (e.g. after adding new scopes)"
            >
              {m.gmailConnecting ? "Connecting..." : "Reconnect Gmail"}
            </button>
          )}
          {m.gmailError && <p className="context-error">{m.gmailError}</p>}
        </div>
        {(m.focus.email ||
          m.focus.calendar ||
          m.focus.contact ||
          m.focus.project ||
          (m.situationContext.userInternetContextLines?.length ?? 0) > 0) && (
          <div className="context-focus">
            <div className="focus-header">
              <h3>Focus</h3>
              <button
                type="button"
                className="focus-clear-btn"
                onClick={() => {
                  m.setFocus({});
                  m.patchSituationContext({ userInternetContextLines: [] });
                }}
                title="Clear focus and pinned web context"
              >
                Clear
              </button>
            </div>
            <ul className="focus-list">
              {m.focus.email && (
                <li className="focus-item">
                  <span className="focus-label">Email:</span>{" "}
                  <button
                    type="button"
                    className="focus-title"
                    onClick={() => m.setFocus((f) => ({ ...f, email: undefined }))}
                    title="Clear focus"
                  >
                    {m.focus.email.title}
                  </button>
                </li>
              )}
              {m.focus.calendar && (
                <li className="focus-item">
                  <span className="focus-label">Calendar:</span>{" "}
                  <button
                    type="button"
                    className="focus-title"
                    onClick={() => m.setFocus((f) => ({ ...f, calendar: undefined }))}
                    title="Clear focus"
                  >
                    {m.focus.calendar.title}
                  </button>
                </li>
              )}
              {m.focus.contact && (
                <li className="focus-item">
                  <span className="focus-label">Contact:</span>{" "}
                  <button
                    type="button"
                    className="focus-title"
                    onClick={() => m.setFocus((f) => ({ ...f, contact: undefined }))}
                    title="Clear focus"
                  >
                    {m.focus.contact.title}
                  </button>
                </li>
              )}
              {m.focus.project && (
                <li className="focus-item">
                  <span className="focus-label">Project:</span>{" "}
                  <button
                    type="button"
                    className="focus-title"
                    onClick={() => m.setFocus((f) => ({ ...f, project: undefined }))}
                    title="Clear focus"
                  >
                    {m.focus.project.title}
                  </button>
                </li>
              )}
              {(m.situationContext.userInternetContextLines ?? []).map(
                (webLine, idx) => (
                  <li key={`web-${idx}`} className="focus-item">
                    <span className="focus-label">Internet:</span>{" "}
                    <button
                      type="button"
                      className="focus-title"
                      onClick={() =>
                        m.patchSituationContext({
                          userInternetContextLines: (
                            m.situationContext.userInternetContextLines ?? []
                          ).filter((_, i) => i !== idx),
                        })
                      }
                      title="Remove this pinned page from context"
                    >
                      {internetContextLineDisplayTitle(webLine)}
                    </button>
                  </li>
                )
              )}
            </ul>
          </div>
        )}
        <div className="context-panel-body">
        <div className="context-tabs">
          <button
            type="button"
            className={`context-tab ${m.contextTab === "email" ? "active" : ""}`}
            onClick={() => m.setContextTab("email")}
          >
            Email
          </button>
          <button
            type="button"
            className={`context-tab ${m.contextTab === "calendar" ? "active" : ""}`}
            onClick={() => m.setContextTab("calendar")}
          >
            Calendar
          </button>
          <button
            type="button"
            className={`context-tab ${m.contextTab === "contacts" ? "active" : ""}`}
            onClick={() => m.setContextTab("contacts")}
          >
            Contacts
          </button>
          <button
            type="button"
            className={`context-tab ${m.contextTab === "internet" ? "active" : ""}`}
            onClick={() => m.setContextTab("internet")}
            title="Web/wiki search; pin results into chat context"
          >
            Internet
          </button>
          <button
            type="button"
            className={`context-tab ${m.contextTab === "user" ? "active" : ""}`}
            onClick={() => m.setContextTab("user")}
            title="Your name, pronouns, and notes for prompts"
          >
            You
          </button>
          <button
            type="button"
            className={`context-tab ${m.contextTab === "worldview" ? "active" : ""}`}
            onClick={() => m.setContextTab("worldview")}
            title="Worldview tool audit (local)"
          >
            WV log
          </button>
        </div>
        <div className="context-content">
          {m.contextTab === "email" && (
            <div className="context-email">
              {!m.gmailConnected ? (
                <p className="context-empty">Connect Gmail to see recent emails.</p>
              ) : m.emailError ? (
                <p className="context-error" title={m.emailError}>
                  Error: {m.emailError}
                </p>
              ) : m.emailsLoading ? (
                <p className="context-empty">Loading…</p>
              ) : m.recentEmails.length === 0 ? (
                <p className="context-empty">No recent emails.</p>
              ) : (
                <ul
                  className="email-list"
                  key={`email-insights-${m.recentEmails.map((x) => x.id).join("|")}|${m.messages.length}|${m.pendingTurnCount}`}
                >
                  {m.recentEmails.map((e) => {
                    const insight = peekEmailInsight(e.id);
                    return (
                    <li
                      key={e.id}
                      className={`email-item ${m.focus.email?.id === e.id ? "focused" : ""}`}
                    >
                      <button
                        type="button"
                        className="email-item-btn"
                        onClick={() =>
                          m.setFocus((f) => ({
                            ...f,
                            email: {
                              id: e.id,
                              title: e.subject || "(No subject)",
                              snippet: e.snippet,
                            },
                          }))
                        }
                      >
                        <div className="email-item-head">
                          {insight ? (
                            <span
                              className={`email-item-insight email-item-insight--${insight.relevance}`}
                              title={`Focused-turn insight: ${insight.relevance}`}
                              aria-label={`Email insight: ${insight.relevance}`}
                            />
                          ) : null}
                          <span className="email-from">{e.from}</span>
                        </div>
                        <span className="email-subject">{e.subject}</span>
                        <span className="email-snippet">{e.snippet}</span>
                        <span className="email-date">
                          {e.date ? new Date(e.date).toLocaleDateString() : ""}
                        </span>
                      </button>
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {m.contextTab === "internet" && (
            <InternetSearchPanel
              internetSearchMaxResults={m.contextEntryBudgets.internetSearchMaxResults}
              userInternetContextLines={m.situationContext.userInternetContextLines}
              onPatchPinned={(merged) =>
                m.patchSituationContext({ userInternetContextLines: merged })
              }
              intro={
                <>
                  Search wikis → Wikipedia → Tavily (if configured) → Google CSE. Use{" "}
                  <strong>Context depth</strong> below to cap how many hits each run
                  requests. Select results, then <strong>Add selected to context</strong>{" "}
                  (lines are merged into relevant context on the next user turn; pinned
                  pages appear under <strong>Focus</strong> above.) For Well of Souls and{" "}
                  <strong>Use selected in new avatar</strong>, open{" "}
                  <strong>Workshops → Creation</strong>.
                </>
              }
            />
          )}
          {m.contextTab === "calendar" && (
            <div className="context-calendar">
              {!m.gmailConnected ? (
                <p className="context-empty">Connect Gmail to see calendar events.</p>
              ) : m.calendarError ? (
                <p className="context-error" title={m.calendarError}>
                  Error: {m.calendarError}
                </p>
              ) : m.calendarLoading ? (
                <p className="context-empty">Loading…</p>
              ) : m.upcomingEvents.length === 0 ? (
                <p className="context-empty">No upcoming events.</p>
              ) : (
                <ul className="event-list">
                  {m.upcomingEvents.map((e) => (
                    <li
                      key={e.id}
                      className={`event-item ${m.focus.calendar?.id === e.id ? "focused" : ""}`}
                    >
                      <button
                        type="button"
                        className="event-item-btn"
                        onClick={() =>
                          m.setFocus((f) => ({
                            ...f,
                            calendar: { id: e.id, title: e.title || "(No title)" },
                          }))
                        }
                      >
                        <span className="event-title">{e.title}</span>
                        <span className="event-time">
                          {e.start
                            ? new Date(e.start).toLocaleString(undefined, {
                                weekday: "short",
                                month: "short",
                                day: "numeric",
                                hour: "numeric",
                                minute: "2-digit",
                              })
                            : ""}
                        </span>
                        {e.location && (
                          <span className="event-location">{e.location}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {m.contextTab === "worldview" && (
            <div className="context-worldview-audit">
              <p className="context-projects-hint">
                Append-only log when avatars run structured tools (world metadata
                patches, Gmail body fetch, etc.). Stored locally. Use{" "}
                <strong>Revert bad patches</strong> when a row applied incorrect
                world metadata — it removes touched project/person ids and restores
                your profile if that tool ran.
              </p>
              {m.worldviewAuditRecords.length === 0 ? (
                <p className="context-empty">No entries yet.</p>
              ) : (
                <ul className="worldview-audit-list">
                  {m.worldviewAuditRecords.map((r) => {
                    const canRevert =
                      !r.revertedAt &&
                      ((r.revertiblePatchCalls?.length ?? 0) > 0 ||
                        !!r.userProfileBefore);
                    return (
                      <li key={r.id} className="worldview-audit-item">
                        <div className="worldview-audit-item-head">
                          <span className="worldview-audit-meta">
                            {new Date(r.ts).toLocaleString()} · {r.avatarId}
                            {r.sourceEmailId
                              ? ` · email ${r.sourceEmailId.slice(0, 8)}…`
                              : ""}
                            {r.revertedAt && (
                              <span className="worldview-audit-reverted">
                                {" "}
                                · reverted{" "}
                                {new Date(r.revertedAt).toLocaleString()}
                              </span>
                            )}
                          </span>
                          {canRevert && (
                            <button
                              type="button"
                              className="worldview-audit-revert-btn"
                              title="Remove world metadata written by these successful patches (best-effort)"
                              onClick={() => {
                                if (
                                  !window.confirm(
                                    "Revert world metadata from this row? Project/person ids touched by successful patches will be removed; user profile will be restored if this row changed it."
                                  )
                                ) {
                                  return;
                                }
                                if (applyWorldviewAuditRevert(r.id)) {
                                  const removedProjectIds = new Set<string>();
                                  const removedContactIds = new Set<string>();
                                  for (const t of r.revertiblePatchCalls ?? []) {
                                    if (t.name === "world_metadata.patch_projects") {
                                      const patch = t.args.patch as
                                        | Record<string, unknown>
                                        | undefined;
                                      if (patch) {
                                        for (const k of Object.keys(patch)) {
                                          removedProjectIds.add(k);
                                        }
                                      }
                                    }
                                    if (t.name === "world_metadata.patch_people") {
                                      const patch = t.args.patch as
                                        | Record<string, unknown>
                                        | undefined;
                                      if (patch) {
                                        for (const k of Object.keys(patch)) {
                                          removedContactIds.add(k);
                                        }
                                      }
                                    }
                                  }
                                  if (
                                    removedProjectIds.size > 0 ||
                                    removedContactIds.size > 0
                                  ) {
                                    m.setFocus((f) => {
                                      let next = f;
                                      if (
                                        f.project?.id &&
                                        removedProjectIds.has(f.project.id)
                                      ) {
                                        next = { ...next, project: undefined };
                                      }
                                      if (
                                        f.contact?.id &&
                                        removedContactIds.has(f.contact.id)
                                      ) {
                                        next = { ...next, contact: undefined };
                                      }
                                      return next;
                                    });
                                  }
                                  m.setWorldviewAuditRefresh((n) => n + 1);
                                  m.setProjectsRefresh((n) => n + 1);
                                  m.setUserProfileRefresh((n) => n + 1);
                                  appendSessionLog(
                                    "ui",
                                    "worldview_audit_reverted",
                                    {
                                      level: "info",
                                      detail: r.id,
                                    }
                                  );
                                }
                              }}
                            >
                              Revert bad patches
                            </button>
                          )}
                        </div>
                        <ul className="worldview-audit-tools">
                          {r.toolResults.map((t, i) => (
                            <li key={i} className="worldview-audit-tool-line">
                              <div className="worldview-audit-tool-summary">
                                {t.name}
                                {t.detail ? ` (${t.detail})` : ""}{" "}
                                {t.ok ? "ok" : `fail: ${t.error ?? "?"}`}
                              </div>
                              {t.argsPreview ? (
                                <pre className="worldview-audit-args">
                                  {t.argsPreview}
                                </pre>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {m.contextTab === "user" && (
            <div className="context-user-profile">
              <p className="context-projects-hint">
                Shown to avatars as <code>User profile (local):</code> in chat
                context (local metadata).
              </p>
              <label className="context-user-label">
                Display name
                <input
                  type="text"
                  className="context-projects-title-input"
                  value={m.userDisplayName}
                  onChange={(e) => m.setUserDisplayName(e.target.value)}
                  placeholder="How you want to be addressed"
                  aria-label="Your display name"
                />
              </label>
              <label className="context-user-label">
                Pronouns
                <input
                  type="text"
                  className="context-projects-title-input"
                  value={m.userPronouns}
                  onChange={(e) => m.setUserPronouns(e.target.value)}
                  placeholder="e.g. they/them"
                  aria-label="Your pronouns"
                />
              </label>
              <label className="context-user-label">
                Notes
                <textarea
                  className="context-projects-notes-input"
                  value={m.userNotes}
                  onChange={(e) => m.setUserNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional context for avatars"
                  aria-label="Notes about you"
                />
              </label>
              <button
                type="button"
                className="context-projects-add-btn"
                onClick={m.handleSaveUserProfile}
              >
                Save profile
              </button>
            </div>
          )}
          {m.contextTab === "contacts" && (
            <div className="context-contacts">
              {!m.gmailConnected ? (
                <p className="context-empty">Connect Gmail to see m.contacts.</p>
              ) : m.contactsError ? (
                <p className="context-error" title={m.contactsError}>
                  Error: {m.contactsError}
                </p>
              ) : m.contactsLoading ? (
                <p className="context-empty">Loading…</p>
              ) : m.contacts.length === 0 ? (
                <p className="context-empty">No m.contacts.</p>
              ) : (
                <ul className="contact-list">
                  {m.contacts.map((c) => (
                    <li
                      key={c.id}
                      className={`contact-item ${m.focus.contact?.id === c.id ? "focused" : ""}`}
                    >
                      <button
                        type="button"
                        className="contact-item-btn"
                        onClick={() =>
                          m.setFocus((f) => ({
                            ...f,
                            contact: { id: c.id, title: c.name || "(No name)" },
                          }))
                        }
                      >
                        <span className="contact-name">{c.name}</span>
                        {c.email && (
                          <span className="contact-email">{c.email}</span>
                        )}
                        {c.birthday && (
                          <span className="contact-birthday">{c.birthday}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        </div>
        {(() => {
          const depthKey =
            m.contextTab === "email" ||
            m.contextTab === "calendar" ||
            m.contextTab === "contacts" ||
            m.contextTab === "internet"
              ? m.contextTab
              : null;
          if (!depthKey) return null;
          const depthMap = m.situationContext.contextEntryDepth ?? {};
          const t = depthMap[depthKey] ?? 0;
          const readout =
            depthKey === "email"
              ? `${m.contextEntryBudgets.emailTopK} emails`
              : depthKey === "calendar"
                ? `${m.contextEntryBudgets.calendarTopK} events`
                : depthKey === "contacts"
                  ? `${m.contextEntryBudgets.contactsTopK} contacts`
                  : `Up to ${m.contextEntryBudgets.internetSearchMaxResults} web hits per run`;
          return (
            <div className="context-entry-depth">
              <div className="context-entry-depth-row">
                <span className="context-entry-depth-title">Context Depth</span>
                <input
                  type="range"
                  min={0}
                  max={1000}
                  value={Math.round(t * 1000)}
                  onChange={(e) =>
                    m.patchSituationContext({
                      contextEntryDepth: {
                        ...depthMap,
                        [depthKey]: Number(e.target.value) / 1000,
                      },
                    })
                  }
                  aria-label={`Context depth (${depthKey})`}
                  className="context-entry-depth-slider"
                />
                <output className="context-entry-depth-readout" aria-live="polite">
                  {readout}
                </output>
              </div>
            </div>
          );
        })()}
        <div className="context-user-mood">
          <h3 className="context-user-mood-title">You right now</h3>
          <label className="tuning-row">
            <span className="tuning-label">
              Engagement <output>{m.userEngagement}</output>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={m.userEngagement}
              onChange={(e) =>
                m.patchBehaviorTuning({
                  userEngagementLevel: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="tuning-row tuning-row--stack">
            <span className="tuning-label">Mood (optional)</span>
            <textarea
              className="context-mood-textarea"
              rows={2}
              placeholder="e.g. rushed, curious, low energy…"
              value={m.userMoodNote}
              onChange={(e) =>
                m.patchBehaviorTuning({ userMoodNote: e.target.value })
              }
            />
          </label>
        </div>
      </aside>
  );
}
