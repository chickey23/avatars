import { useState, useCallback, useEffect, useMemo } from "react";
import { AppProvider, useApp } from "./context/AppContext";
import { assignTask, getTasksForAvatar } from "./services/longTermTasks";
import { useSpeechToText } from "./hooks/useSpeechToText";
import {
  isGmailEnabled,
  hasGmailTokens,
  startGmailOAuth,
  getGmailCredentialsPath,
  getTauriEnv,
  fetchGmailRecent,
  fetchCalendarUpcoming,
  fetchContacts,
} from "./connectors/gmail";
import type { EmailItem, CalendarEvent, Contact } from "./connectors/types";
import type {
  SituationFocus,
  CompactTurnRecord,
  ChatViewMode,
  PendingNotification,
} from "./types";
import type { ChatWindowStyleId } from "./theme/designTokens";
import { CHAT_WINDOW_STYLE_IDS, CHAT_SKIN_STORAGE_KEY, PERSONALITY_TRAITS } from "./theme/designTokens";
import { WellOfSouls } from "./components/WellOfSouls";
import { AiRulesLibraryPanel } from "./components/AiRulesLibraryPanel";
import { loadArchive, formatTurnMetaLine, getTurnLogDetailLines } from "./services/turnArchive";
import {
  getOllamaModelNames,
  getOllamaPresence,
  type OllamaPresence,
} from "./services/ollama";
import { openLink } from "./utils/openLink";
import {
  appendSessionLog,
  initSessionLogDisk,
  type SessionLogDiskInfo,
} from "./services/sessionLog";
import { SessionLogPanel } from "./components/SessionLogPanel";
import "./App.css";

function AppContent() {
  const {
    avatars,
    selectedAvatarId,
    setSelectedAvatarId,
    messages,
    sendMessage,
    clearChat,
    situationContext,
    patchSituationContext,
    pendingTurnCount,
  } = useApp();

  const [inputValue, setInputValue] = useState("");
  const [taskInput, setTaskInput] = useState("");
  const [tasks, setTasks] = useState(() => getTasksForAvatar(selectedAvatarId));
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailHasCreds, setGmailHasCreds] = useState(false);
  const [gmailCredsPath, setGmailCredsPath] = useState<string>("");
  const [envTauri, setEnvTauri] = useState(false);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [contextTab, setContextTab] = useState<
    "email" | "calendar" | "contacts" | "well"
  >("email");
  const [recentEmails, setRecentEmails] = useState<EmailItem[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const [focus, setFocus] = useState<SituationFocus>(
    () => situationContext.userFocus ?? {}
  );

  useEffect(() => {
    patchSituationContext({ userFocus: focus });
  }, [focus, patchSituationContext]);
  const [chatViewMode, setChatViewMode] = useState<ChatViewMode>("chat");
  const [ollamaPresence, setOllamaPresence] = useState<
    "checking" | OllamaPresence
  >("checking");
  const [ollamaLastCheckedAt, setOllamaLastCheckedAt] = useState<number | null>(
    null
  );
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [userPaths, setUserPaths] = useState<{ downloads: string; screenshots: string } | null>(null);
  const [chatSkin, setChatSkin] = useState<ChatWindowStyleId>(() => {
    try {
      const s = localStorage.getItem(CHAT_SKIN_STORAGE_KEY);
      if (s && (CHAT_WINDOW_STYLE_IDS as readonly string[]).includes(s)) return s as ChatWindowStyleId;
    } catch {
      /* ignore */
    }
    return "default";
  });
  const [expandedPromptId, setExpandedPromptId] = useState<string | null>(null);
  /** Sidebar: which avatar shows description + traits (magnifier) */
  const [avatarDetailExpandedId, setAvatarDetailExpandedId] = useState<string | null>(
    null
  );
  /** Sidebar: which avatar shows full pending topic list (badge) */
  const [avatarPendingListOpenId, setAvatarPendingListOpenId] = useState<string | null>(
    null
  );
  const [sessionLogOpen, setSessionLogOpen] = useState(false);
  const [sessionDiskInfo, setSessionDiskInfo] = useState<SessionLogDiskInfo | null>(
    null
  );
  const selectedAvatar = avatars.find((a) => a.id === selectedAvatarId);
  const speech = useSpeechToText();

  const pendingByAvatar = useMemo(() => {
    const m = new Map<string, PendingNotification[]>();
    for (const p of situationContext.pendingNotifications ?? []) {
      if (p.urgency === "low") continue;
      const arr = m.get(p.avatarId) ?? [];
      arr.push(p);
      m.set(p.avatarId, arr);
    }
    return m;
  }, [situationContext.pendingNotifications]);

  const highUrgencyPending = useMemo(
    () =>
      (situationContext.pendingNotifications ?? []).filter(
        (p) => p.urgency === "high"
      ),
    [situationContext.pendingNotifications]
  );

  const messageIdsKey = messages.map((m) => m.id).join(",");
  const turnByUserId = useMemo(() => {
    const m = new Map<string, CompactTurnRecord>();
    for (const r of loadArchive()) {
      m.set(r.userMessageId, r);
    }
    return m;
  }, [messageIdsKey]);

  const archivedTurnCount = useMemo(() => loadArchive().length, [messageIdsKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const info = await initSessionLogDisk();
      if (cancelled) return;
      setSessionDiskInfo(info);
      if (info?.archived && info.archiveNote) {
        window.alert(
          `Session log rotation: 100 log files reached.\n\n${info.archiveNote}\n\n` +
            `Folder:\n${info.logDir}\n\nArchives:\n${info.logDir}\\archives`
        );
      }
      appendSessionLog("session", "Session started", {
        detail:
          `runtime=${getTauriEnv().tauri ? "Tauri" : "browser"}` +
          (info?.currentFile && info.currentFile !== "(unchanged)"
            ? ` | disk=${info.currentFile}`
            : ""),
      });
      if (info?.logDir && !info.alreadyStarted) {
        appendSessionLog("session", "Disk log folder", {
          level: "info",
          detail: info.logDir,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const check = async () => {
      setEnvTauri(getTauriEnv().tauri);
      setGmailHasCreds(await isGmailEnabled());
      setGmailConnected(await hasGmailTokens());
      const pathResult = await getGmailCredentialsPath();
      setGmailCredsPath(pathResult.path);
      if (getTauriEnv().tauri) {
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const paths = await invoke<{ downloads: string; screenshots: string }>("get_user_paths");
          setUserPaths(paths);
        } catch {
          setUserPaths(null);
        }
      }
    };
    check();
  }, []);

  const refreshOllama = useCallback(async (opts?: { silent?: boolean }) => {
    setOllamaPresence("checking");
    const [presence, names] = await Promise.all([
      getOllamaPresence(),
      getOllamaModelNames(),
    ]);
    setOllamaModels(names);
    setOllamaPresence(presence);
    setOllamaLastCheckedAt(Date.now());
    if (!opts?.silent) {
      appendSessionLog(
        "ollama",
        `refresh: presence=${presence} models=${names.length}`,
        {
          level: "info",
          detail:
            names.length > 0
              ? names.slice(0, 8).join(", ") + (names.length > 8 ? "…" : "")
              : undefined,
        }
      );
    }
  }, []);

  useEffect(() => {
    void refreshOllama({ silent: true });
    const id = window.setInterval(() => void refreshOllama({ silent: true }), 15000);
    return () => window.clearInterval(id);
  }, [refreshOllama]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_SKIN_STORAGE_KEY, chatSkin);
    } catch {
      /* ignore */
    }
  }, [chatSkin]);

  useEffect(() => {
    if (contextTab === "email" && gmailConnected) {
      setEmailsLoading(true);
      setEmailError(null);
      fetchGmailRecent(3)
        .then((emails) => {
          setRecentEmails(emails);
          setEmailError(null);
        })
        .catch((e) => {
          setEmailError(e instanceof Error ? e.message : String(e));
          setRecentEmails([]);
        })
        .finally(() => setEmailsLoading(false));
    } else {
      setRecentEmails([]);
      setEmailError(null);
    }
  }, [contextTab, gmailConnected]);

  useEffect(() => {
    if (contextTab === "calendar" && gmailConnected) {
      setCalendarLoading(true);
      setCalendarError(null);
      fetchCalendarUpcoming(30)
        .then((events) => {
          setUpcomingEvents(events);
          setCalendarError(null);
        })
        .catch((e) => {
          setCalendarError(e instanceof Error ? e.message : String(e));
          setUpcomingEvents([]);
        })
        .finally(() => setCalendarLoading(false));
    } else {
      setUpcomingEvents([]);
      setCalendarError(null);
    }
  }, [contextTab, gmailConnected]);

  useEffect(() => {
    if (contextTab === "contacts" && gmailConnected) {
      setContactsLoading(true);
      setContactsError(null);
      fetchContacts(50)
        .then((c) => {
          setContacts(c);
          setContactsError(null);
        })
        .catch((e) => {
          setContactsError(e instanceof Error ? e.message : String(e));
          setContacts([]);
        })
        .finally(() => setContactsLoading(false));
    } else {
      setContacts([]);
      setContactsError(null);
    }
  }, [contextTab, gmailConnected]);

  const handleConnectGmail = useCallback(async () => {
    setGmailConnecting(true);
    setGmailError(null);
    try {
      await startGmailOAuth();
      setGmailConnected(true);
    } catch (e) {
      setGmailError(e instanceof Error ? e.message : String(e));
    } finally {
      setGmailConnecting(false);
    }
  }, []);

  useEffect(() => {
    if (speech.transcript) setInputValue(speech.transcript);
  }, [speech.transcript]);

  const refreshTasks = useCallback(() => {
    setTasks(getTasksForAvatar(selectedAvatarId));
  }, [selectedAvatarId]);

  const handleAssignTask = useCallback(() => {
    if (!taskInput.trim() || !selectedAvatarId) return;
    assignTask(selectedAvatarId, taskInput.trim());
    setTaskInput("");
    refreshTasks();
  }, [taskInput, selectedAvatarId, refreshTasks]);

  const handleSend = useCallback(() => {
    if (!inputValue.trim()) return;
    sendMessage(inputValue, focus);
    setInputValue("");
  }, [inputValue, sendMessage, focus]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTodoClick = useCallback(
    (e: React.MouseEvent, urlOrPath: string) => {
      e.preventDefault();
      openLink(urlOrPath).catch(console.error);
    },
    []
  );

  const todoLinks: { label: string; urlOrPath: string }[] = [
    { label: "Google", urlOrPath: "https://google.com" },
    ...(userPaths
      ? [
          { label: "Screenshots folder", urlOrPath: userPaths.screenshots },
          { label: "Downloads folder", urlOrPath: userPaths.downloads },
        ]
      : []),
  ];

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <h1>Avatars</h1>
          <p className="subtitle">Interface layer for complex data</p>
          <div className="env-indicator" title="Runtime environment">
            <span className={`env-tag ${envTauri ? "env-ok" : "env-warn"}`}>
              Tauri: {envTauri ? "✓" : "✗"}
            </span>
            <button
              type="button"
              className={`env-tag env-tag-btn ollama-env ${
                ollamaPresence === "checking"
                  ? "env-warn"
                  : ollamaPresence === "ready"
                    ? "env-ok"
                    : ollamaPresence === "no_models"
                      ? "env-warn"
                      : "env-error"
              }`}
              onClick={() => void refreshOllama()}
              title={
                ollamaPresence === "checking"
                  ? "Checking Ollama (127.0.0.1:11434)…"
                  : ollamaPresence === "ready"
                    ? `Ollama ready (127.0.0.1:11434). Models: ${ollamaModels.slice(0, 6).join(", ")}${ollamaModels.length > 6 ? "…" : ""}${
                        ollamaLastCheckedAt
                          ? `\nLast checked: ${new Date(ollamaLastCheckedAt).toLocaleTimeString()}`
                          : ""
                      }\nClick to refresh`
                    : ollamaPresence === "no_models"
                      ? `Ollama is running but no models are installed. Run: ollama pull <name>${
                          ollamaLastCheckedAt
                            ? `\nLast checked: ${new Date(ollamaLastCheckedAt).toLocaleTimeString()}`
                            : ""
                        }\nClick to refresh`
                      : `Cannot reach Ollama at 127.0.0.1:11434 (server not running or unreachable).${
                          ollamaLastCheckedAt
                            ? `\nLast checked: ${new Date(ollamaLastCheckedAt).toLocaleTimeString()}`
                            : ""
                        }\nClick to refresh`
              }
            >
              Ollama:{" "}
              {ollamaPresence === "checking"
                ? "…"
                : ollamaPresence === "ready"
                  ? "✓"
                  : ollamaPresence === "no_models"
                    ? "!"
                    : "✗"}
            </button>
            <button
              type="button"
              className="env-tag env-tag-btn session-log-open-btn"
              onClick={() => setSessionLogOpen(true)}
              title="Session log — connectivity, Ollama/Tauri, chat pipeline (this session)"
            >
              Log
            </button>
          </div>
        </div>
        <nav className="todo-list">
          <h3>To Do List</h3>
          <ul>
            {todoLinks.map((item) => (
              <li key={item.label}>
                <button
                  type="button"
                  className="todo-link"
                  onClick={(e) => handleTodoClick(e, item.urlOrPath)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <aside className="avatar-sidebar">
        <h2>Primary Avatars</h2>
        {avatars.map((avatar) => {
          const pendList = pendingByAvatar.get(avatar.id);
          const pendCount = pendList?.length ?? 0;
          const firstPending = pendList?.[0];
          return (
            <div
              key={avatar.id}
              className={`avatar-card ${selectedAvatarId === avatar.id ? "selected" : ""}`}
            >
              <div className="avatar-card-row avatar-card-row--top">
                <button
                  type="button"
                  className="avatar-card-select"
                  onClick={() => {
                    setSelectedAvatarId(avatar.id);
                    setTasks(getTasksForAvatar(avatar.id));
                  }}
                >
                  <span className="avatar-name">{avatar.givenName}</span>
                </button>
                <div className="avatar-card-toolbar">
                  {pendCount > 0 && (
                    <button
                      type="button"
                      className={`avatar-pending-badge ${
                        avatarPendingListOpenId === avatar.id ? "is-open" : ""
                      }`}
                      title="Show pending topics for this avatar"
                      aria-label={`${pendCount} pending notifications`}
                      aria-expanded={avatarPendingListOpenId === avatar.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setAvatarPendingListOpenId((id) =>
                          id === avatar.id ? null : avatar.id
                        );
                        setAvatarDetailExpandedId(null);
                      }}
                    >
                      {pendCount}
                    </button>
                  )}
                  <button
                    type="button"
                    className="avatar-detail-toggle"
                    title="Personality, description, and traits"
                    aria-label="Show personality, description, and traits"
                    aria-expanded={avatarDetailExpandedId === avatar.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setAvatarDetailExpandedId((id) =>
                        id === avatar.id ? null : avatar.id
                      );
                      setAvatarPendingListOpenId(null);
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
              {avatarPendingListOpenId === avatar.id && pendList && pendList.length > 0 && (
                <ul className="avatar-pending-list" aria-label="Pending topics">
                  {pendList.map((p) => (
                    <li key={p.id}>{p.topicSummary}</li>
                  ))}
                </ul>
              )}
              {avatarDetailExpandedId === avatar.id && (
                <div className="avatar-detail-panel">
                  <p className="avatar-desc">{avatar.description}</p>
                  {avatar.traitIds && avatar.traitIds.length > 0 && (
                    <div className="avatar-trait-chips" aria-label="Personality traits">
                      {avatar.traitIds.map((tid) => (
                        <span key={tid} className="avatar-trait-chip">
                          {PERSONALITY_TRAITS.find((t) => t.id === tid)?.label ??
                            tid}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {selectedAvatar && (
          <div className="task-assign">
            <h3>Assign task to {selectedAvatar.givenName}</h3>
            <div className="task-input-row">
              <input
                type="text"
                value={taskInput}
                onChange={(e) => setTaskInput(e.target.value)}
                placeholder="Task title..."
                onKeyDown={(e) => e.key === "Enter" && handleAssignTask()}
              />
              <button onClick={handleAssignTask} disabled={!taskInput.trim()}>
                Add
              </button>
            </div>
            {tasks.length > 0 && (
              <ul className="task-list">
                {tasks.map((t) => (
                  <li key={t.id}>{t.title}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <AiRulesLibraryPanel />
      </aside>

      <main
        className={`chat-main${
          selectedAvatar
            ? ` chat-frame--${selectedAvatar.id.replace(/[^a-z0-9_-]/gi, "")}`
            : ""
        }`}
      >
        {selectedAvatar && (
          <>
            {highUrgencyPending.length > 0 && (
              <div className="proactive-interrupt-banner" role="status">
                Time-sensitive — see <strong>Primary Avatars</strong> in the sidebar
                {highUrgencyPending.length > 1
                  ? ` (${highUrgencyPending.length} items)`
                  : ""}
                .
              </div>
            )}
            <div className="chat-header">
              <h2>Conversation with {selectedAvatar.givenName}</h2>
              <div className="chat-header-actions">
                <label className="chat-view-mode-label">
                  <span className="chat-view-mode-label-text">View</span>
                  <select
                    className="chat-view-mode-select"
                    aria-label="Chat view mode"
                    value={chatViewMode}
                    onChange={(e) =>
                      setChatViewMode(e.target.value as ChatViewMode)
                    }
                  >
                    <option value="chat">Chat</option>
                    <option value="chat_routing">Chat + routing</option>
                    <option value="routing_log">Routing + log</option>
                  </select>
                </label>
                <label className="chat-skin-label">
                  <span className="chat-view-mode-label-text">Window</span>
                  <select
                    className="chat-view-mode-select"
                    aria-label="Chat window style"
                    value={chatSkin}
                    onChange={(e) => setChatSkin(e.target.value as ChatWindowStyleId)}
                  >
                    {CHAT_WINDOW_STYLE_IDS.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="clear-chat-btn"
                  onClick={clearChat}
                  disabled={messages.length === 0}
                  title="Clear conversation (archive kept)"
                >
                  Clear chat
                </button>
              </div>
            </div>

            <div className={`chat-messages chat-skin--${chatSkin}`}>
              {messages.length === 0 ? (
                <div className="empty-state">
                  <p>Start a conversation with {selectedAvatar.givenName}.</p>
                  {(chatViewMode === "chat_routing" ||
                    chatViewMode === "routing_log") &&
                    archivedTurnCount > 0 && (
                    <p className="archive-empty-hint">
                      {archivedTurnCount} past turn(s) in archive (conversation cleared).
                    </p>
                  )}
                </div>
              ) : (
                messages.map((msg) => {
                  const turn = msg.role === "user" ? turnByUserId.get(msg.id) : undefined;
                  const fromAvatar = msg.role === "avatar" ? avatars.find((a) => a.id === msg.avatarId) : undefined;
                  const src = msg.replySource;
                  const avatarFontClass =
                    msg.role === "avatar" &&
                    src === "ollama" &&
                    msg.avatarId &&
                    ["muse", "accomplice", "skeptic"].includes(msg.avatarId)
                      ? `message-font--${msg.avatarId}`
                      : "";
                  const sourceClass =
                    msg.role === "avatar"
                      ? src === "rules"
                        ? "message-block--rules"
                        : src === "fallback"
                          ? "message-block--fallback"
                          : src === "ollama"
                            ? "message-block--ollama"
                            : "message-block--legacy"
                      : "";
                  const textStyle =
                    msg.role === "avatar"
                      ? src === "rules" || src === "fallback"
                        ? "text-style--bodyRules"
                        : src === "ollama"
                          ? "text-style--bodyAi"
                          : "text-style--caption"
                      : "";
                  const sourceLabel =
                    msg.role === "avatar"
                      ? src === "ollama"
                        ? "Ollama"
                        : src === "rules"
                          ? "Rules"
                          : src === "fallback"
                            ? "Fallback"
                            : ""
                      : "";
                  return (
                    <div
                      key={msg.id}
                      className={`message-block ${
                        msg.role === "user" ? "message-block-user" : "message-block-avatar"
                      } ${sourceClass}`}
                      data-avatar-id={msg.role === "avatar" ? msg.avatarId : undefined}
                    >
                      <div
                        className={`message ${msg.role}`}
                        data-avatar-id={msg.avatarId}
                      >
                        <span className="message-role">
                          {msg.role === "user"
                            ? "You"
                            : fromAvatar?.givenName ?? "Avatar"}
                          {sourceLabel && (
                            <span className={`message-source-badge message-source-badge--${src}`}>
                              {sourceLabel}
                            </span>
                          )}
                        </span>
                        <p
                          className={`message-content ${textStyle} ${avatarFontClass} ${
                            msg.role === "avatar" && src === "ollama" ? "message-content--ai-fx" : ""
                          }`}
                        >
                          {msg.content}
                        </p>
                        {msg.role === "avatar" &&
                          msg.promptDebug &&
                          (src === "ollama" || src === "fallback") && (
                          <div className="message-prompt-tools">
                            <button
                              type="button"
                              className="message-prompt-toggle"
                              aria-expanded={expandedPromptId === msg.id}
                              onClick={() =>
                                setExpandedPromptId((id) =>
                                  id === msg.id ? null : msg.id
                                )
                              }
                            >
                              {expandedPromptId === msg.id ? "▼" : "▶"}{" "}
                              {src === "ollama"
                                ? "Prompt sent to Ollama"
                                : "Ollama generation failed"}
                            </button>
                            {expandedPromptId === msg.id && (
                              <div className="message-prompt-expanded">
                                {src === "fallback" && msg.replyError && (
                                  <div
                                    className="message-prompt-error-banner"
                                    role="alert"
                                  >
                                    {msg.replyError}
                                  </div>
                                )}
                                {src === "fallback" && (
                                  <p className="message-prompt-fallback-hint">
                                    The reply text is from the{" "}
                                    <strong>template rule engine</strong> after the
                                    local LLM call failed. The prompt below was
                                    prepared for Ollama.
                                  </p>
                                )}
                                <div className="message-prompt-section-label">
                                  Full prompt
                                </div>
                                <pre className="message-prompt-full">
                                  {msg.promptDebug.fullPrompt}
                                </pre>
                                <details className="message-prompt-details">
                                  <summary>Structured details</summary>
                                  <pre className="message-prompt-panel message-prompt-panel--json">
                                    {JSON.stringify(
                                      Object.fromEntries(
                                        Object.entries(
                                          msg.promptDebug as unknown as Record<
                                            string,
                                            unknown
                                          >
                                        ).filter(([k]) => k !== "fullPrompt")
                                      ),
                                      null,
                                      2
                                    )}
                                  </pre>
                                </details>
                                {src === "fallback" && (
                                  <p className="message-prompt-meta">
                                    For more detail, check the browser console for{" "}
                                    <code>[ollama]</code> logs.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                        {msg.role === "avatar" && src === "rules" && fromAvatar && (
                          <div className="message-prompt-tools">
                            <button
                              type="button"
                              className="message-prompt-toggle"
                              aria-expanded={expandedPromptId === msg.id}
                              onClick={() =>
                                setExpandedPromptId((id) =>
                                  id === msg.id ? null : msg.id
                                )
                              }
                            >
                              {expandedPromptId === msg.id ? "▼" : "▶"} Why no
                              Ollama prompt?
                            </button>
                            {expandedPromptId === msg.id && (
                              <div className="message-prompt-panel message-prompt-panel--explainer">
                                {msg.rulesSkipReason === "no_models" ? (
                                  <p>
                                    This reply came from the{" "}
                                    <strong>template rule engine</strong> because
                                    Ollama is reachable but <strong>no models are
                                    installed</strong>. Pull a model (e.g.{" "}
                                    <code>ollama pull llama3.2</code>), then send
                                    again for local LLM generation. There is no
                                    Ollama prompt for this message.
                                  </p>
                                ) : (
                                  <p>
                                    This reply came from the{" "}
                                    <strong>template rule engine</strong>, not the
                                    local LLM, because the Ollama server was not
                                    reachable at <code>127.0.0.1:11434</code>. There
                                    is no Ollama prompt for this message.
                                  </p>
                                )}
                                <p className="message-prompt-meta">
                                  Avatar: <code>{fromAvatar.id}</code>
                                  {fromAvatar.ruleSetId && (
                                    <>
                                      {" "}
                                      · Rule set:{" "}
                                      <code>{fromAvatar.ruleSetId}</code>
                                    </>
                                  )}
                                </p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      {msg.role === "user" &&
                        (chatViewMode === "chat_routing" ||
                          chatViewMode === "routing_log") &&
                        turn && (
                          <>
                            <div
                              className="chat-turn-meta"
                              title={formatTurnMetaLine(turn)}
                            >
                              {formatTurnMetaLine(turn)}
                            </div>
                            {chatViewMode === "routing_log" && (
                              <div className="chat-turn-log-detail">
                                {getTurnLogDetailLines(turn, avatars).map(
                                  (line, i) => (
                                    <div key={i} className="chat-turn-log-line">
                                      {line}
                                    </div>
                                  )
                                )}
                              </div>
                            )}
                          </>
                        )}
                    </div>
                  );
                })
              )}
            </div>

            {pendingTurnCount > 0 && (
              <div className="chat-pending-bar" role="status" aria-live="polite">
                <span className="chat-pending-icon" aria-hidden>
                  ⏳
                </span>
                <span className="chat-pending-text">
                  {pendingTurnCount === 1
                    ? "Reply in progress…"
                    : `${pendingTurnCount} replies in progress…`}
                </span>
              </div>
            )}

            <div className="chat-input-area">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${selectedAvatar.givenName}...`}
                className="chat-input"
              />
              <button
                type="button"
                title={speech.isListening ? "Stop listening" : "Voice input"}
                className={`mic-btn ${speech.isListening ? "active" : ""}`}
                onClick={speech.isListening ? speech.stopListening : speech.startListening}
                disabled={!!speech.error}
              >
                {speech.isListening ? "●" : "🎤"}
              </button>
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="send-btn"
              >
                Send
              </button>
            </div>
          </>
        )}
      </main>

      <aside className="context-panel">
        <h2>Context</h2>
        {situationContext.wellOfSoulsRules?.trim() && (
          <div className="well-of-souls-context-chip" aria-live="polite">
            <span className="well-of-souls-chip-label">Well of Souls draft</span>
            {situationContext.useWellOfSoulsInChat && (
              <span className="well-of-souls-chip-on">In chat context</span>
            )}
            <button
              type="button"
              className="well-of-souls-chip-clear"
              onClick={() =>
                patchSituationContext({
                  wellOfSoulsRules: "",
                  useWellOfSoulsInChat: false,
                })
              }
            >
              Clear
            </button>
          </div>
        )}
        <div className="context-connect">
          {!gmailConnected ? (
            <>
              <button
                type="button"
                className="connection-btn"
                onClick={handleConnectGmail}
                disabled={gmailConnecting || !gmailHasCreds}
              >
                {gmailConnecting ? "Connecting..." : "Connect Gmail"}
              </button>
              {!gmailHasCreds && gmailCredsPath && (
                <p className="context-setup-hint" title={gmailCredsPath}>
                  Set up credentials at: {gmailCredsPath}
                </p>
              )}
            </>
          ) : (
            <button
              type="button"
              className="connection-btn connection-btn-secondary"
              onClick={handleConnectGmail}
              disabled={gmailConnecting}
              title="Reconnect to refresh tokens (e.g. after adding new scopes)"
            >
              {gmailConnecting ? "Connecting..." : "Reconnect Gmail"}
            </button>
          )}
          {gmailError && <p className="context-error">{gmailError}</p>}
        </div>
        {(focus.email || focus.calendar || focus.contact) && (
          <div className="context-focus">
            <div className="focus-header">
              <h3>Focus</h3>
              <button
                type="button"
                className="focus-clear-btn"
                onClick={() => setFocus({})}
                title="Clear all focus"
              >
                Clear
              </button>
            </div>
            <ul className="focus-list">
              {focus.email && (
                <li className="focus-item">
                  <span className="focus-label">Email:</span>{" "}
                  <button
                    type="button"
                    className="focus-title"
                    onClick={() => setFocus((f) => ({ ...f, email: undefined }))}
                    title="Clear focus"
                  >
                    {focus.email.title}
                  </button>
                </li>
              )}
              {focus.calendar && (
                <li className="focus-item">
                  <span className="focus-label">Calendar:</span>{" "}
                  <button
                    type="button"
                    className="focus-title"
                    onClick={() => setFocus((f) => ({ ...f, calendar: undefined }))}
                    title="Clear focus"
                  >
                    {focus.calendar.title}
                  </button>
                </li>
              )}
              {focus.contact && (
                <li className="focus-item">
                  <span className="focus-label">Contact:</span>{" "}
                  <button
                    type="button"
                    className="focus-title"
                    onClick={() => setFocus((f) => ({ ...f, contact: undefined }))}
                    title="Clear focus"
                  >
                    {focus.contact.title}
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}
        <div className="context-tabs">
          <button
            type="button"
            className={`context-tab ${contextTab === "email" ? "active" : ""}`}
            onClick={() => setContextTab("email")}
          >
            Email
          </button>
          <button
            type="button"
            className={`context-tab ${contextTab === "calendar" ? "active" : ""}`}
            onClick={() => setContextTab("calendar")}
          >
            Calendar
          </button>
          <button
            type="button"
            className={`context-tab ${contextTab === "contacts" ? "active" : ""}`}
            onClick={() => setContextTab("contacts")}
          >
            Contacts
          </button>
          <button
            type="button"
            className={`context-tab ${contextTab === "well" ? "active" : ""}`}
            onClick={() => setContextTab("well")}
            title="Well of Souls (WoS) — personality rule generator"
          >
            WoS
          </button>
        </div>
        <div className="context-content">
          {contextTab === "email" && (
            <div className="context-email">
              {!gmailConnected ? (
                <p className="context-empty">Connect Gmail to see recent emails.</p>
              ) : emailError ? (
                <p className="context-error" title={emailError}>
                  Error: {emailError}
                </p>
              ) : emailsLoading ? (
                <p className="context-empty">Loading…</p>
              ) : recentEmails.length === 0 ? (
                <p className="context-empty">No recent emails.</p>
              ) : (
                <ul className="email-list">
                  {recentEmails.map((e) => (
                    <li
                      key={e.id}
                      className={`email-item ${focus.email?.id === e.id ? "focused" : ""}`}
                    >
                      <button
                        type="button"
                        className="email-item-btn"
                        onClick={() =>
                          setFocus((f) => ({
                            ...f,
                            email: { id: e.id, title: e.subject || "(No subject)" },
                          }))
                        }
                      >
                        <span className="email-from">{e.from}</span>
                        <span className="email-subject">{e.subject}</span>
                        <span className="email-snippet">{e.snippet}</span>
                        <span className="email-date">
                          {e.date ? new Date(e.date).toLocaleDateString() : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {contextTab === "calendar" && (
            <div className="context-calendar">
              {!gmailConnected ? (
                <p className="context-empty">Connect Gmail to see calendar events.</p>
              ) : calendarError ? (
                <p className="context-error" title={calendarError}>
                  Error: {calendarError}
                </p>
              ) : calendarLoading ? (
                <p className="context-empty">Loading…</p>
              ) : upcomingEvents.length === 0 ? (
                <p className="context-empty">No upcoming events.</p>
              ) : (
                <ul className="event-list">
                  {upcomingEvents.map((e) => (
                    <li
                      key={e.id}
                      className={`event-item ${focus.calendar?.id === e.id ? "focused" : ""}`}
                    >
                      <button
                        type="button"
                        className="event-item-btn"
                        onClick={() =>
                          setFocus((f) => ({
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
          {contextTab === "well" && (
            <div className="context-well">
              <WellOfSouls
                variant="panel"
                storedRules={situationContext.wellOfSoulsRules ?? ""}
                onStoredRulesChange={(text) =>
                  patchSituationContext({ wellOfSoulsRules: text })
                }
                useInChat={situationContext.useWellOfSoulsInChat ?? false}
                onUseInChatChange={(v) =>
                  patchSituationContext({ useWellOfSoulsInChat: v })
                }
              />
            </div>
          )}
          {contextTab === "contacts" && (
            <div className="context-contacts">
              {!gmailConnected ? (
                <p className="context-empty">Connect Gmail to see contacts.</p>
              ) : contactsError ? (
                <p className="context-error" title={contactsError}>
                  Error: {contactsError}
                </p>
              ) : contactsLoading ? (
                <p className="context-empty">Loading…</p>
              ) : contacts.length === 0 ? (
                <p className="context-empty">No contacts.</p>
              ) : (
                <ul className="contact-list">
                  {contacts.map((c) => (
                    <li
                      key={c.id}
                      className={`contact-item ${focus.contact?.id === c.id ? "focused" : ""}`}
                    >
                      <button
                        type="button"
                        className="contact-item-btn"
                        onClick={() =>
                          setFocus((f) => ({
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
      </aside>
      {sessionLogOpen && (
        <SessionLogPanel
          diskLogDir={sessionDiskInfo?.logDir ?? null}
          onClose={() => setSessionLogOpen(false)}
        />
      )}
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
