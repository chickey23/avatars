import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { AppProvider } from "./context/AppContext";
import { useApp } from "./context/useApp";
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
  BehaviorTuning,
  Avatar,
} from "./types";
import {
  DEFAULT_PROACTIVE_MIN_COMBINED_SCORE,
  DEFAULT_PROACTIVE_MIN_AFFINITY_BONUS,
  DEFAULT_REPLY_CONTEXT_FOCUS,
  DEFAULT_USER_ENGAGEMENT_LEVEL,
} from "./services/behaviorTuningFormat";
import type { ChatWindowStyleId, PersonalityTraitId } from "./theme/designTokens";
import { CHAT_WINDOW_STYLE_IDS, CHAT_SKIN_STORAGE_KEY, PERSONALITY_TRAITS } from "./theme/designTokens";
import { WellOfSouls } from "./components/WellOfSouls";
import {
  AvatarBuilderModal,
  type AvatarBuilderInitial,
} from "./components/AvatarBuilderModal";
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
import { SwitchboardViz } from "./components/SwitchboardViz";
import { selectDisplayTrace } from "./services/switchboardVizModel";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";
import {
  getWorldMetadata,
  patchWorldMetadataProjects,
} from "./services/worldMetadata";
import {
  MAX_PRIMARY_SLOTS,
  resolvePrimarySlotCount,
} from "./store/primaryRoster";
import { isDefaultAvatarId } from "./store/avatarCatalog";
import {
  getAvatarPortraitSrc,
  readPortraitFileAsDataUrl,
  MAX_PORTRAIT_FILE_BYTES,
} from "./services/avatarPortrait";
import "./App.css";

const SWITCHBOARD_VIZ_STORAGE_KEY = "avatars_switchboard_viz_enabled";

function AppContent() {
  const {
    avatars,
    fullAvatarCatalog,
    selectedAvatarIds,
    setSelectedAvatarIds,
    toggleAvatarSelection,
    clearAvatarSelection,
    messages,
    sendMessage,
    clearChat,
    situationContext,
    patchSituationContext,
    pendingTurnCount,
    processingUserMessageId,
    liveSwitchboardTrace,
  } = useApp();

  const reducedMotion = usePrefersReducedMotion();
  const [showSwitchboardViz, setShowSwitchboardViz] = useState(() => {
    try {
      return localStorage.getItem(SWITCHBOARD_VIZ_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        SWITCHBOARD_VIZ_STORAGE_KEY,
        showSwitchboardViz ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
  }, [showSwitchboardViz]);

  const [inputValue, setInputValue] = useState("");
  /** Selected world-metadata project id for “Assign task” (dropdown). */
  const [taskProjectId, setTaskProjectId] = useState("");
  const [avatarBuilderOpen, setAvatarBuilderOpen] = useState(false);
  const [avatarBuilderInitial, setAvatarBuilderInitial] =
    useState<AvatarBuilderInitial | null>(null);

  const handleWellOfSoulsAfterGenerate = useCallback(
    (payload: {
      seed: string;
      traitIds: PersonalityTraitId[];
      ruleBlockIds: string[];
      generatedText: string;
    }) => {
      setAvatarBuilderInitial({
        kind: "seed",
        seed: payload.seed,
        traitIds: payload.traitIds,
        ruleBlockIds: payload.ruleBlockIds,
        supplementalRules: payload.generatedText,
      });
      setAvatarBuilderOpen(true);
    },
    []
  );

  const handleAvatarBuilderSave = useCallback(
    (avatar: Avatar) => {
      if (isDefaultAvatarId(avatar.id)) {
        const prev = situationContext.builtinAvatarEdits ?? {};
        patchSituationContext({
          builtinAvatarEdits: { ...prev, [avatar.id]: avatar },
        });
        return;
      }
      const userPrev = situationContext.userAvatars ?? [];
      const idx = userPrev.findIndex((a) => a.id === avatar.id);
      if (idx >= 0) {
        const next = [...userPrev];
        next[idx] = avatar;
        patchSituationContext({ userAvatars: next });
      } else {
        patchSituationContext({ userAvatars: [...userPrev, avatar] });
      }
    },
    [situationContext.userAvatars, situationContext.builtinAvatarEdits, patchSituationContext]
  );

  const primaryCatalogLen = fullAvatarCatalog.length;
  const maxPrimarySlotOptions = Math.min(MAX_PRIMARY_SLOTS, primaryCatalogLen);
  const effectivePrimarySlots = resolvePrimarySlotCount(
    situationContext,
    primaryCatalogLen
  );
  const firstSelectedId = selectedAvatarIds[0] ?? "";
  const [tasks, setTasks] = useState(() => getTasksForAvatar(firstSelectedId));
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailHasCreds, setGmailHasCreds] = useState(false);
  const [gmailCredsPath, setGmailCredsPath] = useState<string>("");
  const [envTauri, setEnvTauri] = useState(false);
  const [gmailConnecting, setGmailConnecting] = useState(false);
  const [gmailError, setGmailError] = useState<string | null>(null);
  const [contextTab, setContextTab] = useState<
    "email" | "calendar" | "contacts" | "projects" | "well"
  >("email");
  const [projectsRefresh, setProjectsRefresh] = useState(0);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectNotes, setNewProjectNotes] = useState("");
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
  const portraitFileInputRef = useRef<HTMLInputElement>(null);
  const portraitPickAvatarIdRef = useRef<string | null>(null);
  const [portraitFileError, setPortraitFileError] = useState<{
    avatarId: string;
    message: string;
  } | null>(null);

  const openPortraitFilePicker = useCallback((avatarId: string) => {
    setPortraitFileError(null);
    portraitPickAvatarIdRef.current = avatarId;
    portraitFileInputRef.current?.click();
  }, []);

  const handlePortraitFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const avatarId = portraitPickAvatarIdRef.current;
      portraitPickAvatarIdRef.current = null;
      e.target.value = "";
      if (!file || !avatarId) return;
      const dataUrl = await readPortraitFileAsDataUrl(file);
      if (!dataUrl) {
        setPortraitFileError({
          avatarId,
          message: `Choose an image under ${Math.floor(MAX_PORTRAIT_FILE_BYTES / (1024 * 1024))} MB.`,
        });
        return;
      }
      setPortraitFileError(null);
      patchSituationContext({
        avatarPortraitSrcById: {
          ...(situationContext.avatarPortraitSrcById ?? {}),
          [avatarId]: dataUrl,
        },
      });
    },
    [patchSituationContext, situationContext.avatarPortraitSrcById]
  );

  const clearPortrait = useCallback(
    (avatarId: string) => {
      setPortraitFileError(null);
      const prev = situationContext.avatarPortraitSrcById ?? {};
      if (!(avatarId in prev)) return;
      const next = { ...prev };
      delete next[avatarId];
      patchSituationContext({
        avatarPortraitSrcById: Object.keys(next).length > 0 ? next : undefined,
      });
    },
    [patchSituationContext, situationContext.avatarPortraitSrcById]
  );

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
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const selectedAvatar =
    selectedAvatarIds.length === 1
      ? avatars.find((a) => a.id === selectedAvatarIds[0])
      : undefined;
  const taskAssignAvatar = firstSelectedId
    ? avatars.find((a) => a.id === firstSelectedId)
    : undefined;
  const chatSelectionLabel = useMemo(() => {
    if (selectedAvatarIds.length === 0) return "Switchboard";
    if (selectedAvatarIds.length === 1) {
      return (
        avatars.find((a) => a.id === selectedAvatarIds[0])?.givenName ?? "Avatar"
      );
    }
    const names = selectedAvatarIds
      .map((id) => avatars.find((a) => a.id === id)?.givenName ?? id)
      .join(", ");
    return names.length > 72 ? `${selectedAvatarIds.length} avatars` : names;
  }, [selectedAvatarIds, avatars]);

  const messagePlaceholder = useMemo(() => {
    if (selectedAvatarIds.length === 0) return "Message the switchboard…";
    if (selectedAvatarIds.length === 1) {
      const n =
        avatars.find((a) => a.id === selectedAvatarIds[0])?.givenName ??
        "avatar";
      return `Message ${n}…`;
    }
    return "Message selected avatars…";
  }, [selectedAvatarIds, avatars]);

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

  const behaviorTuning = situationContext.behaviorTuning ?? {};

  const patchBehaviorTuning = useCallback(
    (patch: Partial<BehaviorTuning>) => {
      patchSituationContext({
        behaviorTuning: {
          ...(situationContext.behaviorTuning ?? {}),
          ...patch,
        },
      });
    },
    [situationContext.behaviorTuning, patchSituationContext]
  );

  const proactiveMinCombined =
    behaviorTuning.proactiveMinCombinedScore ??
    DEFAULT_PROACTIVE_MIN_COMBINED_SCORE;
  const proactiveMinAffinity =
    behaviorTuning.proactiveMinAffinityBonus ??
    DEFAULT_PROACTIVE_MIN_AFFINITY_BONUS;
  const replyContextFocus =
    behaviorTuning.replyContextFocus ?? DEFAULT_REPLY_CONTEXT_FOCUS;
  const userEngagement =
    behaviorTuning.userEngagementLevel ?? DEFAULT_USER_ENGAGEMENT_LEVEL;
  const userMoodNote = behaviorTuning.userMoodNote ?? "";

  const projectsList = useMemo(() => {
    void projectsRefresh;
    const p = getWorldMetadata().projects;
    return Object.entries(p).sort((a, b) =>
      a[1].title.localeCompare(b[1].title, undefined, { sensitivity: "base" })
    );
  }, [projectsRefresh]);

  const handleAddWorldProject = useCallback(() => {
    const title = newProjectTitle.trim();
    if (!title) return;
    patchWorldMetadataProjects({
      [crypto.randomUUID()]: {
        title,
        notes: newProjectNotes.trim() || undefined,
        updatedAt: Date.now(),
      },
    });
    setNewProjectTitle("");
    setNewProjectNotes("");
    setProjectsRefresh((n) => n + 1);
  }, [newProjectTitle, newProjectNotes]);

  const handleRemoveWorldProject = useCallback((id: string) => {
    patchWorldMetadataProjects({ [id]: null });
    setFocus((f) =>
      f.project?.id === id ? { ...f, project: undefined } : f
    );
    setProjectsRefresh((n) => n + 1);
  }, []);

  const messageIdsKey = messages.map((m) => m.id).join(",");
  const turnByUserId = useMemo(() => {
    const m = new Map<string, CompactTurnRecord>();
    for (const r of loadArchive()) {
      m.set(r.userMessageId, r);
    }
    return m;
  }, [messageIdsKey, pendingTurnCount]);

  const archivedTurnCount = useMemo(() => loadArchive().length, [messageIdsKey]);

  const displaySwitchboardTrace = useMemo(
    () =>
      selectDisplayTrace({
        messages,
        liveTrace: liveSwitchboardTrace,
        processingUserMessageId,
        turnByUserId,
      }),
    [
      messages,
      liveSwitchboardTrace,
      processingUserMessageId,
      turnByUserId,
    ]
  );

  const accentForSwitchboard = useCallback(
    (avatarId: string) =>
      fullAvatarCatalog.find((a) => a.id === avatarId)?.appearance?.accentColor ??
      "rgba(120, 120, 140, 0.65)",
    [fullAvatarCatalog]
  );

  useLayoutEffect(() => {
    const el = chatMessagesRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight - el.clientHeight;
  }, [messages, pendingTurnCount, selectedAvatarIds]);

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
    setTasks(getTasksForAvatar(firstSelectedId));
  }, [firstSelectedId]);

  useEffect(() => {
    setTasks(getTasksForAvatar(firstSelectedId));
  }, [firstSelectedId]);

  useEffect(() => {
    if (!taskProjectId) return;
    const exists = projectsList.some(([id]) => id === taskProjectId);
    if (!exists) setTaskProjectId("");
  }, [projectsList, taskProjectId]);

  const handleAssignTask = useCallback(() => {
    if (!firstSelectedId || !taskProjectId) return;
    const proj = getWorldMetadata().projects[taskProjectId];
    if (!proj?.title?.trim()) return;
    assignTask(
      firstSelectedId,
      proj.title.trim(),
      proj.notes?.trim() || undefined
    );
    setTaskProjectId("");
    refreshTasks();
  }, [taskProjectId, firstSelectedId, refreshTasks]);

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
        <input
          ref={portraitFileInputRef}
          type="file"
          accept="image/*"
          className="avatar-portrait-file-input"
          aria-hidden
          tabIndex={-1}
          onChange={handlePortraitFileChange}
        />
        <div className="avatar-sidebar-heading">
          <h2>Primary Avatars</h2>
          <div className="avatar-sidebar-heading-tools">
            {maxPrimarySlotOptions > 0 && (
              <div className="avatar-roster-size">
                <select
                  className="avatar-roster-size-select"
                  aria-label="Number of primary avatar slots shown in the sidebar"
                  value={effectivePrimarySlots}
                  onChange={(e) =>
                    patchSituationContext({
                      primaryAvatarSlotCount: Number(e.target.value),
                    })
                  }
                >
                  {Array.from({ length: maxPrimarySlotOptions }, (_, i) => i + 1).map(
                    (n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    )
                  )}
                </select>
              </div>
            )}
            {selectedAvatarIds.length > 0 && (
              <button
                type="button"
                className="avatar-clear-selection"
                aria-label="Use automatic routing for all chat messages. Clears targeted avatar selection."
                title="Use switchboard routing instead of only the selected avatars"
                onClick={() => clearAvatarSelection()}
              >
                ALL CHAT
              </button>
            )}
          </div>
        </div>
        {avatars.map((avatar) => {
          const portraitSrc = getAvatarPortraitSrc(
            situationContext.avatarPortraitSrcById,
            avatar.id,
            avatar.appearance?.portraitUrl
          );
          const portraitInitial =
            avatar.givenName.trim().charAt(0).toUpperCase() || "?";
          const pendList = pendingByAvatar.get(avatar.id);
          const pendCount = pendList?.length ?? 0;
          const firstPending = pendList?.[0];
          const detailTasks = getTasksForAvatar(avatar.id);
          return (
            <div
              key={avatar.id}
              className={`avatar-card ${
                selectedAvatarIds.includes(avatar.id) ? "selected" : ""
              }`}
            >
              <div className="avatar-card-row avatar-card-row--top">
                <button
                  type="button"
                  className="avatar-card-select"
                  onClick={() => toggleAvatarSelection(avatar.id)}
                >
                  <span className="avatar-portrait" aria-hidden="true">
                    {portraitSrc ? (
                      <img
                        src={portraitSrc}
                        alt=""
                        className="avatar-portrait-img"
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
                    title="Avatar details"
                    aria-label="Show avatar details"
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
                    <li key={p.id} className="avatar-pending-item">
                      <span className="avatar-pending-item-text">{p.topicSummary}</span>
                      <span className="avatar-pending-item-actions">
                        <button
                          type="button"
                          className="avatar-pending-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAvatarIds([avatar.id]);
                            void sendMessage(
                              `Let's discuss this now: ${p.topicSummary}`,
                              focus,
                              {
                                releasedClusterIds: [p.topicClusterId],
                                primaryAvatarId: avatar.id,
                              }
                            );
                            setAvatarPendingListOpenId(null);
                          }}
                        >
                          Discuss
                        </button>
                        <button
                          type="button"
                          className="avatar-pending-action avatar-pending-action--muted"
                          onClick={(e) => {
                            e.stopPropagation();
                            patchSituationContext({
                              pendingNotifications: (
                                situationContext.pendingNotifications ?? []
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
              {avatarDetailExpandedId === avatar.id && (
                <div className="avatar-detail-panel">
                  <section className="avatar-detail-section">
                    <h4 className="avatar-detail-section-label">Portrait</h4>
                    <div className="avatar-portrait-row">
                      <span className="avatar-portrait avatar-portrait--large" aria-hidden="true">
                        {portraitSrc ? (
                          <img
                            src={portraitSrc}
                            alt=""
                            className="avatar-portrait-img"
                          />
                        ) : (
                          <span
                            className="avatar-portrait-fallback"
                            style={{
                              background:
                                avatar.appearance?.accentColor ??
                                "rgba(120,120,140,0.5)",
                            }}
                          >
                            {portraitInitial}
                          </span>
                        )}
                      </span>
                      <div className="avatar-portrait-actions">
                        <button
                          type="button"
                          className="avatar-portrait-choose"
                          aria-label={`Choose portrait image for ${avatar.givenName}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            openPortraitFilePicker(avatar.id);
                          }}
                        >
                          Choose image…
                        </button>
                        {portraitSrc && (
                          <button
                            type="button"
                            className="avatar-portrait-remove"
                            aria-label={`Remove portrait for ${avatar.givenName}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              clearPortrait(avatar.id);
                            }}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    {portraitFileError?.avatarId === avatar.id && (
                      <p className="avatar-portrait-error" role="status">
                        {portraitFileError.message}
                      </p>
                    )}
                  </section>
                  <section className="avatar-detail-section">
                    <h4 className="avatar-detail-section-label">
                      Tags{" "}
                      <span className="avatar-detail-section-hint">(for match)</span>
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
                  <section className="avatar-detail-section">
                    <h4 className="avatar-detail-section-label">
                      Assigned tasks{" "}
                      <span className="avatar-detail-section-hint">
                        (for match and response)
                      </span>
                    </h4>
                    {detailTasks.length > 0 ? (
                      <ul className="avatar-detail-task-list">
                        {detailTasks.map((t) => (
                          <li key={t.id} title={t.description ?? undefined}>
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
                      Description{" "}
                      <span className="avatar-detail-section-hint">
                        (for response)
                      </span>
                    </h4>
                    <p className="avatar-desc">{avatar.description}</p>
                  </section>
                  <section className="avatar-detail-section">
                    <h4 className="avatar-detail-section-label">
                      Personality{" "}
                      <span className="avatar-detail-section-hint">
                        (for response)
                      </span>
                    </h4>
                    <p className="avatar-personality">{avatar.personality}</p>
                  </section>
                  <section className="avatar-detail-section">
                    <h4 className="avatar-detail-section-label">
                      Traits{" "}
                      <span className="avatar-detail-section-hint">
                        (for response)
                      </span>
                    </h4>
                    {avatar.traitIds && avatar.traitIds.length > 0 ? (
                      <div
                        className="avatar-trait-chips"
                        aria-label="Personality traits"
                      >
                        {avatar.traitIds.map((tid) => (
                          <span key={tid} className="avatar-trait-chip">
                            {PERSONALITY_TRAITS.find((t) => t.id === tid)
                              ?.label ?? tid}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="avatar-detail-empty">None</span>
                    )}
                  </section>
                  {!avatar.uneditable && (
                    <section className="avatar-detail-section avatar-detail-section--builder">
                      <button
                        type="button"
                        className="avatar-detail-edit-builder"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAvatarBuilderInitial({ kind: "edit", avatar: { ...avatar } });
                          setAvatarBuilderOpen(true);
                        }}
                      >
                        Edit in builder…
                      </button>
                    </section>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <details className="task-assign-details">
          <summary className="task-assign-summary">
            {taskAssignAvatar
              ? `Assign task · ${taskAssignAvatar.givenName}`
              : "Assign tasks"}
            {tasks.length > 0 ? (
              <span className="task-assign-count" aria-hidden>
                {" "}
                ({tasks.length})
              </span>
            ) : null}
          </summary>
          <div className="task-assign-body">
            {!firstSelectedId && (
              <p className="task-assign-hint">Select an avatar to assign tasks.</p>
            )}
            <div className="task-input-row">
              <select
                className="task-project-select"
                value={taskProjectId}
                onChange={(e) => setTaskProjectId(e.target.value)}
                disabled={!firstSelectedId || projectsList.length === 0}
                aria-label="Project to assign as task"
              >
                <option value="">
                  {projectsList.length === 0
                    ? "Add projects under Context → Projects"
                    : "Choose a project…"}
                </option>
                {projectsList.map(([id, proj]) => (
                  <option key={id} value={id}>
                    {proj.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAssignTask}
                disabled={!taskProjectId || !firstSelectedId}
              >
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
        </details>
        <AiRulesLibraryPanel />
        <div className="behavior-tuning-panel">
          <h3 className="behavior-tuning-title">Behavior</h3>
          <p className="behavior-tuning-hint">
            Proactive email notifications and reply balance (saved with your session).
          </p>
          <label className="tuning-row">
            <span className="tuning-label">
              Proactive min score <output>{proactiveMinCombined}</output>
            </span>
            <input
              type="range"
              min={35}
              max={75}
              value={proactiveMinCombined}
              onChange={(e) =>
                patchBehaviorTuning({
                  proactiveMinCombinedScore: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="tuning-row">
            <span className="tuning-label">
              Extra avatar affinity <output>{proactiveMinAffinity}</output>
            </span>
            <input
              type="range"
              min={0}
              max={25}
              value={proactiveMinAffinity}
              onChange={(e) =>
                patchBehaviorTuning({
                  proactiveMinAffinityBonus: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="tuning-row">
            <span className="tuning-label">
              Reply: 0 persona · 100 context <output>{replyContextFocus}</output>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={replyContextFocus}
              onChange={(e) =>
                patchBehaviorTuning({
                  replyContextFocus: Number(e.target.value),
                })
              }
            />
          </label>
        </div>
      </aside>

      <main
        className={`chat-main${
          selectedAvatar
            ? ` chat-frame--${selectedAvatar.id.replace(/[^a-z0-9_-]/gi, "")}`
            : ""
        }`}
      >
            <div className="chat-header">
              <h2>
                {selectedAvatarIds.length === 0
                  ? "Switchboard"
                  : `Conversation with ${chatSelectionLabel}`}
              </h2>
              <div className="chat-header-actions">
                <label className="chat-view-mode-label chat-switchboard-viz-label">
                  <input
                    type="checkbox"
                    className="chat-switchboard-viz-check"
                    checked={showSwitchboardViz}
                    onChange={(e) => setShowSwitchboardViz(e.target.checked)}
                    aria-label="Show Switchboard wave column"
                  />
                  <span className="chat-view-mode-label-text">Waves</span>
                </label>
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

            <div className="chat-body-row">
            {showSwitchboardViz && (
              <aside
                className="switchboard-viz-column"
                aria-label="Switchboard routing waves"
              >
                <SwitchboardViz
                  trace={displaySwitchboardTrace}
                  getAccentColor={accentForSwitchboard}
                  isLive={processingUserMessageId !== null}
                  reducedMotion={reducedMotion}
                />
              </aside>
            )}
            <div
              ref={chatMessagesRef}
              className={`chat-messages chat-skin--${chatSkin}`}
            >
              {messages.length === 0 ? (
                <div className="empty-state">
                  <p>
                    {selectedAvatarIds.length === 0
                      ? "Send a message; well-matched avatars will reply."
                      : selectedAvatarIds.length === 1
                        ? `Start a conversation with ${chatSelectionLabel}.`
                        : "Send a message to solicit replies from the selected avatars."}
                  </p>
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
                  const fromAvatar =
                    msg.role === "avatar" && msg.avatarId
                      ? fullAvatarCatalog.find((a) => a.id === msg.avatarId)
                      : undefined;
                  const msgPortraitSrc =
                    msg.role === "avatar" && msg.avatarId
                      ? getAvatarPortraitSrc(
                          situationContext.avatarPortraitSrcById,
                          msg.avatarId,
                          fromAvatar?.appearance?.portraitUrl
                        )
                      : undefined;
                  const msgPortraitInitial =
                    fromAvatar?.givenName?.trim().charAt(0).toUpperCase() || "?";
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
                        <span
                          className={`message-role${
                            msg.role === "avatar" && sourceLabel && src === "ollama"
                              ? " message-role--ollama-badge-trailing"
                              : ""
                          }`}
                        >
                          <span className="message-role-ident">
                            {msg.role === "avatar" && (
                              <span className="message-avatar-portrait" aria-hidden="true">
                                {msgPortraitSrc ? (
                                  <img
                                    src={msgPortraitSrc}
                                    alt=""
                                    className="message-avatar-portrait-img"
                                  />
                                ) : (
                                  <span
                                    className="message-avatar-portrait-fallback"
                                    style={{
                                      background:
                                        fromAvatar?.appearance?.accentColor ??
                                        "rgba(120,120,140,0.5)",
                                    }}
                                  >
                                    {msgPortraitInitial}
                                  </span>
                                )}
                              </span>
                            )}
                            {msg.role === "user"
                              ? "You"
                              : fromAvatar?.givenName ?? "Avatar"}
                            {sourceLabel && src !== "ollama" && (
                              <span
                                className={`message-source-badge message-source-badge--${src}`}
                              >
                                {sourceLabel}
                              </span>
                            )}
                          </span>
                          {sourceLabel && src === "ollama" && (
                            <span
                              className={`message-source-badge message-source-badge--${src}`}
                            >
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
                                {getTurnLogDetailLines(turn, fullAvatarCatalog).map(
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

            <div
              className="chat-avatar-picker"
              role="group"
              aria-label="Choose avatars to address in your next message"
            >
              <span className="chat-avatar-picker-label">Speaking</span>
              <div className="chat-avatar-picker-scroll">
                {fullAvatarCatalog.map((a) => {
                  const selected = selectedAvatarIds.includes(a.id);
                  const pSrc = getAvatarPortraitSrc(
                    situationContext.avatarPortraitSrcById,
                    a.id,
                    a.appearance?.portraitUrl
                  );
                  const pInitial =
                    a.givenName.trim().charAt(0).toUpperCase() || "?";
                  return (
                    <button
                      key={a.id}
                      type="button"
                      className={`chat-avatar-picker-item ${
                        selected ? "is-selected" : ""
                      }`}
                      aria-pressed={selected}
                      aria-label={`${selected ? "Remove" : "Add"} ${a.givenName}`}
                      title={a.givenName}
                      onClick={() => toggleAvatarSelection(a.id)}
                    >
                      <span className="chat-avatar-picker-portrait" aria-hidden>
                        {pSrc ? (
                          <img
                            src={pSrc}
                            alt=""
                            className="chat-avatar-picker-img"
                          />
                        ) : (
                          <span
                            className="chat-avatar-picker-fallback"
                            style={{
                              background:
                                a.appearance?.accentColor ??
                                "rgba(120,120,140,0.5)",
                            }}
                          >
                            {pInitial}
                          </span>
                        )}
                      </span>
                      <span className="chat-avatar-picker-name">{a.givenName}</span>
                    </button>
                  );
                })}
              </div>
              {selectedAvatarIds.length > 0 && (
                <button
                  type="button"
                  className="chat-avatar-picker-all"
                  aria-label="Use automatic routing for all chat messages"
                  title="Clear targeted avatar selection"
                  onClick={() => clearAvatarSelection()}
                >
                  ALL CHAT
                </button>
              )}
            </div>

            <div className="chat-input-area">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={messagePlaceholder}
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
        {(focus.email ||
          focus.calendar ||
          focus.contact ||
          focus.project) && (
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
              {focus.project && (
                <li className="focus-item">
                  <span className="focus-label">Project:</span>{" "}
                  <button
                    type="button"
                    className="focus-title"
                    onClick={() => setFocus((f) => ({ ...f, project: undefined }))}
                    title="Clear focus"
                  >
                    {focus.project.title}
                  </button>
                </li>
              )}
            </ul>
          </div>
        )}
        <div className="context-panel-body">
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
            className={`context-tab ${contextTab === "projects" ? "active" : ""}`}
            onClick={() => setContextTab("projects")}
            title="Shared project list (local metadata)"
          >
            Projects
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
          {contextTab === "projects" && (
            <div className="context-projects">
              <p className="context-projects-hint">
                Local shared metadata (this browser). For future project execution
                and context.
              </p>
              <div className="context-projects-add">
                <input
                  type="text"
                  className="context-projects-title-input"
                  placeholder="Project title…"
                  value={newProjectTitle}
                  onChange={(e) => setNewProjectTitle(e.target.value)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.preventDefault(), handleAddWorldProject())
                  }
                  aria-label="New project title"
                />
                <textarea
                  className="context-projects-notes-input"
                  placeholder="Notes (optional)"
                  value={newProjectNotes}
                  onChange={(e) => setNewProjectNotes(e.target.value)}
                  rows={2}
                  aria-label="New project notes"
                />
                <button
                  type="button"
                  className="context-projects-add-btn"
                  onClick={handleAddWorldProject}
                  disabled={!newProjectTitle.trim()}
                >
                  Add project
                </button>
              </div>
              {projectsList.length === 0 ? (
                <p className="context-empty">No projects yet.</p>
              ) : (
                <ul className="wm-project-list">
                  {projectsList.map(([id, proj]) => (
                    <li
                      key={id}
                      className={`wm-project-item ${
                        focus.project?.id === id ? "focused" : ""
                      }`}
                    >
                      <button
                        type="button"
                        className="wm-project-select"
                        onClick={() =>
                          setFocus((f) => ({
                            ...f,
                            project: { id, title: proj.title },
                          }))
                        }
                        aria-label={`Set focus to project ${proj.title}`}
                      >
                        <span className="wm-project-title">{proj.title}</span>
                        {proj.notes?.trim() && (
                          <span className="wm-project-notes">{proj.notes.trim()}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        className="wm-project-remove"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveWorldProject(id);
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
                onAfterGenerate={handleWellOfSoulsAfterGenerate}
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
        </div>
        <div className="context-user-mood">
          <h3 className="context-user-mood-title">You right now</h3>
          <label className="tuning-row">
            <span className="tuning-label">
              Engagement <output>{userEngagement}</output>
            </span>
            <input
              type="range"
              min={0}
              max={100}
              value={userEngagement}
              onChange={(e) =>
                patchBehaviorTuning({
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
              value={userMoodNote}
              onChange={(e) =>
                patchBehaviorTuning({ userMoodNote: e.target.value })
              }
            />
          </label>
        </div>
      </aside>
      {sessionLogOpen && (
        <SessionLogPanel
          diskLogDir={sessionDiskInfo?.logDir ?? null}
          onClose={() => setSessionLogOpen(false)}
        />
      )}
      <AvatarBuilderModal
        open={avatarBuilderOpen}
        onClose={() => {
          setAvatarBuilderOpen(false);
          setAvatarBuilderInitial(null);
        }}
        initial={avatarBuilderInitial}
        existingUserAvatars={situationContext.userAvatars ?? []}
        onSave={handleAvatarBuilderSave}
      />
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
