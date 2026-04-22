import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent,
  type CSSProperties,
} from "react";
import { AppProvider } from "./context/AppContext";
import { useApp } from "./context/useApp";
import { getTasksForAvatar } from "./services/longTermTasks";
import { ensureProjectTaskForAvatar } from "./services/projectAvatarLink";
import { describeFocusChange } from "./services/focusWatcher";
import {
  appendTopicSegment,
  buildTopicSegmentRecord,
} from "./services/conversationSegments";
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
  ConversationMessage,
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
import { resolveContextEntryBudgets } from "./utils/contextEntryBudget";
import {
  appendSessionLog,
  initSessionLogDisk,
  type SessionLogDiskInfo,
} from "./services/sessionLog";
import { SessionLogPanel } from "./components/SessionLogPanel";
import { SwitchboardViz } from "./components/SwitchboardViz";
import { SourceCacheViz } from "./components/SourceCacheViz";
import {
  WAVES_BLINK_ONLY_MAX_WIDTH_PX,
  WAVES_COLUMN_HIDE_MAX_WIDTH_PX,
  WAVES_QUEUE_STORAGE_KEY,
  countWavesQueueByKind,
} from "./services/switchboardWavesQueue";
import { parseRankedEmailLinesFromRelevantData } from "./services/sourceCacheViz";
import { usePrefersReducedMotion } from "./hooks/usePrefersReducedMotion";
import {
  getWorldMetadata,
  patchWorldMetadataProjects,
  patchUserProfile,
} from "./services/worldMetadata";
import {
  loadWorldviewAudit,
  applyWorldviewAuditRevert,
} from "./services/worldviewAudit";
import {
  applyScoreDeltaWithCap,
  applyUnhelpfulDecrement,
  getRosterScore,
  listPopInAvatarIdsForProjectFocus,
  resolveExecutorAvatarId,
  scoresFromCoreOrder,
} from "./services/avatarRoster";
import {
  MAX_PRIMARY_SLOTS,
  resolvePrimarySlotCount,
} from "./store/primaryRoster";
import { isDefaultAvatarId } from "./store/avatarCatalog";
import { runSyntheticAction } from "./services/monitors";
import {
  getAvatarPortraitSrc,
  readPortraitFileAsDataUrl,
  MAX_PORTRAIT_FILE_BYTES,
} from "./services/avatarPortrait";
import { getAvatarVizColor } from "./services/avatarVizColor";
import { peekEmailInsight, loadEmailInsightsDoc } from "./services/emailInsights";
import { AGENT_CAPABILITIES } from "./data/agentCapabilities";
import "./App.css";

const SWITCHBOARD_VIZ_STORAGE_KEY = "avatars_switchboard_viz_enabled";
const CHAT_VIZ_WIDTH_STORAGE_KEY = "avatars_chat_visualizer_width_px";
const CHAT_VIZ_WIDTH_MIN = 8;
const CHAT_VIZ_WIDTH_MAX = 320;
const CHAT_VIZ_WIDTH_DEFAULT = 120;
const SOURCE_CACHE_VIZ_STORAGE_KEY = "avatars_source_cache_viz_enabled";
const SOURCE_CACHE_VIZ_WIDTH_STORAGE_KEY = "avatars_source_cache_viz_width_px";
const USER_CHROME_STORAGE_KEY = "avatars_user_chrome_color";
const USER_CHROME_DEFAULT = "#0f3460";

const FUTURE_SOURCE_COLUMNS = [
  { id: "reddit", label: "Reddit" },
  { id: "hotmail", label: "Hotmail / Outlook" },
  { id: "youtube", label: "YouTube (now playing / recent)" },
  { id: "steam", label: "Steam" },
] as const;

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
    wavesQueue,
  } = useApp();

  const contextEntryBudgets = useMemo(
    () => resolveContextEntryBudgets(situationContext.contextEntryDepth),
    [situationContext.contextEntryDepth]
  );

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

  const [chatVizWidthPx, setChatVizWidthPx] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_VIZ_WIDTH_STORAGE_KEY);
      if (raw) {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n)) {
          return Math.min(
            CHAT_VIZ_WIDTH_MAX,
            Math.max(CHAT_VIZ_WIDTH_MIN, n)
          );
        }
      }
    } catch {
      /* ignore */
    }
    return CHAT_VIZ_WIDTH_DEFAULT;
  });

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_VIZ_WIDTH_STORAGE_KEY, String(chatVizWidthPx));
    } catch {
      /* ignore */
    }
  }, [chatVizWidthPx]);

  const [showSourceCacheViz, setShowSourceCacheViz] = useState(() => {
    try {
      return localStorage.getItem(SOURCE_CACHE_VIZ_STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        SOURCE_CACHE_VIZ_STORAGE_KEY,
        showSourceCacheViz ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
  }, [showSourceCacheViz]);

  const [sourceCacheVizWidthPx, setSourceCacheVizWidthPx] = useState(() => {
    try {
      const raw = localStorage.getItem(SOURCE_CACHE_VIZ_WIDTH_STORAGE_KEY);
      if (raw) {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n)) {
          return Math.min(
            CHAT_VIZ_WIDTH_MAX,
            Math.max(CHAT_VIZ_WIDTH_MIN, n)
          );
        }
      }
    } catch {
      /* ignore */
    }
    return CHAT_VIZ_WIDTH_DEFAULT;
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        SOURCE_CACHE_VIZ_WIDTH_STORAGE_KEY,
        String(sourceCacheVizWidthPx)
      );
    } catch {
      /* ignore */
    }
  }, [sourceCacheVizWidthPx]);

  const [userChromeColor, setUserChromeColor] = useState(() => {
    try {
      const v = localStorage.getItem(USER_CHROME_STORAGE_KEY);
      if (v && /^#[0-9A-Fa-f]{6}$/.test(v)) return v;
    } catch {
      /* ignore */
    }
    return USER_CHROME_DEFAULT;
  });

  useEffect(() => {
    try {
      localStorage.setItem(USER_CHROME_STORAGE_KEY, userChromeColor);
    } catch {
      /* ignore */
    }
  }, [userChromeColor]);

  const [vizDebug, setVizDebug] = useState(false);
  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("debugViz");
      setVizDebug(
        Boolean(import.meta.env.DEV) || q === "1" || q === "true"
      );
    } catch {
      setVizDebug(Boolean(import.meta.env.DEV));
    }
  }, []);

  const vizResizeDragRef = useRef<{
    active: boolean;
    startX: number;
    startW: number;
  }>({ active: false, startX: 0, startW: 0 });

  const onVizResizePointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      vizResizeDragRef.current = {
        active: true,
        startX: e.clientX,
        startW: chatVizWidthPx,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [chatVizWidthPx]
  );

  const onVizResizePointerMove = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (!vizResizeDragRef.current.active) return;
      const { startX, startW } = vizResizeDragRef.current;
      const dx = e.clientX - startX;
      const next = startW + dx;
      setChatVizWidthPx(
        Math.min(CHAT_VIZ_WIDTH_MAX, Math.max(CHAT_VIZ_WIDTH_MIN, next))
      );
    },
    []
  );

  const onVizResizePointerUp = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      vizResizeDragRef.current.active = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    []
  );

  const sourceCacheVizResizeDragRef = useRef<{
    active: boolean;
    startX: number;
    startW: number;
  }>({ active: false, startX: 0, startW: 0 });

  const onSourceCacheVizResizePointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      sourceCacheVizResizeDragRef.current = {
        active: true,
        startX: e.clientX,
        startW: sourceCacheVizWidthPx,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [sourceCacheVizWidthPx]
  );

  const onSourceCacheVizResizePointerMove = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (!sourceCacheVizResizeDragRef.current.active) return;
      const { startX, startW } = sourceCacheVizResizeDragRef.current;
      const dx = e.clientX - startX;
      const next = startW - dx;
      setSourceCacheVizWidthPx(
        Math.min(CHAT_VIZ_WIDTH_MAX, Math.max(CHAT_VIZ_WIDTH_MIN, next))
      );
    },
    []
  );

  const onSourceCacheVizResizePointerUp = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      sourceCacheVizResizeDragRef.current.active = false;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    []
  );

  const [inputValue, setInputValue] = useState("");
  /** Selected world-metadata project id for “Assign task” (dropdown). */
  const [taskProjectId, setTaskProjectId] = useState("");
  /**
   * Transient status line for the Assign-task widget: surfaces a confirmation
   * after a successful add and a diagnostic when the handler would otherwise
   * silently return (no avatar selected, picked project vanished, placeholder
   * title, etc.). Clears after ~4s so the widget doesn't accumulate chatter.
   */
  const [taskAssignStatus, setTaskAssignStatus] = useState<{
    kind: "ok" | "warn";
    text: string;
  } | null>(null);
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
    (payload: { avatar: Avatar; rosterScore: number }) => {
      const { avatar, rosterScore } = payload;
      const nextScores = {
        ...(situationContext.avatarRosterPriorityScoreById ?? {}),
      };
      nextScores[avatar.id] = Math.max(
        0,
        Math.min(100, Math.round(rosterScore))
      );
      if (isDefaultAvatarId(avatar.id)) {
        const prev = situationContext.builtinAvatarEdits ?? {};
        patchSituationContext({
          builtinAvatarEdits: { ...prev, [avatar.id]: avatar },
          avatarRosterPriorityScoreById: nextScores,
        });
        return;
      }
      const userPrev = situationContext.userAvatars ?? [];
      const idx = userPrev.findIndex((a) => a.id === avatar.id);
      if (idx >= 0) {
        const next = [...userPrev];
        next[idx] = avatar;
        patchSituationContext({
          userAvatars: next,
          avatarRosterPriorityScoreById: nextScores,
        });
      } else {
        patchSituationContext({
          userAvatars: [...userPrev, avatar],
          avatarRosterPriorityScoreById: nextScores,
        });
      }
    },
    [
      situationContext.userAvatars,
      situationContext.builtinAvatarEdits,
      situationContext.avatarRosterPriorityScoreById,
      patchSituationContext,
    ]
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
    | "email"
    | "calendar"
    | "contacts"
    | "projects"
    | "user"
    | "worldview"
    | "well"
  >("email");
  const openWorldviewTab = useCallback(() => {
    setContextTab("worldview");
  }, []);
  const [projectsRefresh, setProjectsRefresh] = useState(0);
  const selectedIdsKey = selectedAvatarIds.join("\0");
  const executorAvatarId = useMemo(
    () =>
      resolveExecutorAvatarId(
        situationContext,
        selectedAvatarIds.length > 0 ? selectedAvatarIds : undefined
      ),
    [situationContext, selectedIdsKey]
  );
  const popInAvatarIds = useMemo(
    () =>
      listPopInAvatarIdsForProjectFocus(situationContext.userFocus?.project?.id),
    [situationContext.userFocus?.project?.id, projectsRefresh]
  );
  /**
   * Pop-up avatars: selected via "Talk to" but not in the primary roster and
   * not already shown in the project pop-in panel. Rendered in the sidebar as
   * a temporary location so the user sees who they're addressing.
   */
  const popUpAvatarIds = useMemo(() => {
    const primary = new Set(avatars.map((a) => a.id));
    const popin = new Set(popInAvatarIds);
    return selectedAvatarIds.filter(
      (id) => !primary.has(id) && !popin.has(id)
    );
  }, [selectedAvatarIds, avatars, popInAvatarIds]);
  const popInScoreBumpedRef = useRef<{ projectId: string; ids: Set<string> } | null>(
    null
  );
  useEffect(() => {
    const pid = situationContext.userFocus?.project?.id?.trim() ?? "";
    if (!pid) {
      popInScoreBumpedRef.current = null;
      return;
    }
    if (
      !popInScoreBumpedRef.current ||
      popInScoreBumpedRef.current.projectId !== pid
    ) {
      popInScoreBumpedRef.current = { projectId: pid, ids: new Set() };
    }
  }, [situationContext.userFocus?.project?.id]);

  const handlePopInAvatarClick = useCallback(
    (avatarId: string) => {
      const pid = situationContext.userFocus?.project?.id?.trim();
      if (!pid) return;
      let bump = popInScoreBumpedRef.current;
      if (!bump || bump.projectId !== pid) {
        bump = { projectId: pid, ids: new Set() };
        popInScoreBumpedRef.current = bump;
      }
      const allIds = fullAvatarCatalog.map((a) => a.id);
      let nextScores = {
        ...(situationContext.avatarRosterPriorityScoreById ?? {}),
      };
      if (!bump.ids.has(avatarId)) {
        nextScores = applyScoreDeltaWithCap(nextScores, avatarId, 1, allIds);
        bump.ids.add(avatarId);
      }
      patchSituationContext({
        avatarRosterPriorityScoreById: nextScores,
        executorOverrideAvatarId: avatarId,
      });
    },
    [
      situationContext.userFocus?.project?.id,
      situationContext.avatarRosterPriorityScoreById,
      fullAvatarCatalog,
      patchSituationContext,
    ]
  );

  const handleMoveCoreRoster = useCallback(
    (avatarId: string, delta: -1 | 1) => {
      const ids = avatars.map((a) => a.id);
      const i = ids.indexOf(avatarId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= ids.length) return;
      const next = [...ids];
      [next[i], next[j]] = [next[j]!, next[i]!];
      const allIds = fullAvatarCatalog.map((a) => a.id);
      patchSituationContext({
        avatarRosterPriorityScoreById: scoresFromCoreOrder(
          situationContext.avatarRosterPriorityScoreById,
          next,
          allIds
        ),
        executorOverrideAvatarId: undefined,
      });
    },
    [
      avatars,
      fullAvatarCatalog,
      situationContext.avatarRosterPriorityScoreById,
      patchSituationContext,
    ]
  );

  const [userProfileRefresh, setUserProfileRefresh] = useState(0);
  const [worldviewAuditRefresh, setWorldviewAuditRefresh] = useState(0);
  const [userDisplayName, setUserDisplayName] = useState("");
  const [userPronouns, setUserPronouns] = useState("");
  const [userNotes, setUserNotes] = useState("");
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [newProjectSummary, setNewProjectSummary] = useState("");
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

  const prevFocusRef = useRef<SituationFocus | undefined>(undefined);
  const focusWatcherBoot = useRef(true);
  useEffect(() => {
    if (focusWatcherBoot.current) {
      focusWatcherBoot.current = false;
      prevFocusRef.current = focus;
      return;
    }
    const line = describeFocusChange(prevFocusRef.current, focus);
    prevFocusRef.current = focus;
    if (!line) return;
    patchSituationContext({
      recentEvents: [...(situationContext.recentEvents ?? []).slice(-19), line],
    });
  }, [focus, patchSituationContext, situationContext.recentEvents]);
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
  const [behaviorPanelOpen, setBehaviorPanelOpen] = useState(false);
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

  useEffect(() => {
    void userProfileRefresh;
    if (contextTab !== "user") return;
    const up = getWorldMetadata().userProfile;
    setUserDisplayName(up.displayName ?? "");
    setUserPronouns(up.pronouns ?? "");
    setUserNotes(up.notes ?? "");
  }, [contextTab, userProfileRefresh]);

  const handleSaveUserProfile = useCallback(() => {
    patchUserProfile({
      displayName: userDisplayName.trim() || undefined,
      pronouns: userPronouns.trim() || undefined,
      notes: userNotes.trim() || undefined,
    });
    setUserProfileRefresh((n) => n + 1);
  }, [userDisplayName, userPronouns, userNotes]);

  const worldviewAuditRecords = useMemo(() => {
    void worldviewAuditRefresh;
    return loadWorldviewAudit()
      .slice(-40)
      .reverse();
  }, [worldviewAuditRefresh]);

  useEffect(() => {
    if (contextTab === "worldview") {
      setWorldviewAuditRefresh((n) => n + 1);
    }
  }, [contextTab]);

  const handleAddWorldProject = useCallback(() => {
    const title = newProjectTitle.trim();
    if (!title) return;
    patchWorldMetadataProjects({
      [crypto.randomUUID()]: {
        title,
        summary: newProjectSummary.trim() || undefined,
        notes: newProjectNotes.trim() || undefined,
        updatedAt: Date.now(),
      },
    });
    setNewProjectTitle("");
    setNewProjectSummary("");
    setNewProjectNotes("");
    setProjectsRefresh((n) => n + 1);
  }, [newProjectTitle, newProjectSummary, newProjectNotes]);

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

  const sourceCacheVizSnapshot = useMemo(() => {
    void projectsRefresh;
    void userProfileRefresh;
    void worldviewAuditRefresh;
    const doc = loadEmailInsightsDoc();
    const entries = Object.values(doc.entries);
    const byRelevance = { relevant: 0, irrelevant: 0, uncertain: 0 };
    for (const row of entries) {
      byRelevance[row.relevance]++;
    }
    const recentSamples = [...entries]
      .sort((a, b) => b.lastAccessedAt - a.lastAccessedAt)
      .slice(0, 6)
      .map((row) => ({
        messageId: row.messageId,
        summary: row.summary.replace(/\s+/g, " ").trim(),
        relevance: row.relevance,
      }));
    const wm = getWorldMetadata();
    const wvTail = loadWorldviewAudit()
      .slice(-8)
      .reverse()
      .map((r) => ({
        id: r.id,
        ts: r.ts,
        avatarId: r.avatarId,
        revertedAt: r.revertedAt,
        tools: r.toolResults
          .map((t) => `${t.name}${t.ok ? "" : "!"}`)
          .join(", "),
      }));
    const lastUser = [...messages]
      .reverse()
      .find((m) => m.role === "user" && m.emailFocusArtifacts);
    return {
      diagnostics: situationContext.lastEmailRankingDiagnostics,
      parsedFallbackLines: parseRankedEmailLinesFromRelevantData(
        situationContext.relevantData
      ),
      emailInsights: {
        total: entries.length,
        byRelevance,
        recentSamples,
      },
      worldMeta: {
        peopleCount: Object.keys(wm.people).length,
        projectsCount: Object.keys(wm.projects).length,
        userProfileUpdatedAt: wm.userProfile.updatedAt,
      },
      worldviewAuditTail: wvTail,
      wavesQueueLength: wavesQueue.length,
      wavesStorageKey: WAVES_QUEUE_STORAGE_KEY,
      lastUserEmailFocus: lastUser?.emailFocusArtifacts,
      futureSources: [...FUTURE_SOURCE_COLUMNS],
    };
  }, [
    messageIdsKey,
    pendingTurnCount,
    projectsRefresh,
    userProfileRefresh,
    worldviewAuditRefresh,
    situationContext.lastEmailRankingDiagnostics,
    situationContext.relevantData,
    messages,
    wavesQueue.length,
  ]);

  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1200
  );
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const wavesColumnVisible =
    viewportWidth > WAVES_COLUMN_HIDE_MAX_WIDTH_PX;
  const wavesMotionTier = !wavesColumnVisible
    ? "hidden"
    : viewportWidth <= WAVES_BLINK_ONLY_MAX_WIDTH_PX
      ? "blink"
      : "full";

  const [hoverMetaMessageId, setHoverMetaMessageId] = useState<string | null>(
    null
  );

  const handleMessageRowActivate = useCallback(
    (msg: ConversationMessage) => {
      const row = chatMessagesRef.current?.querySelector(
        `[data-message-id="${msg.id}"]`
      );
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
      if (msg.role === "avatar" && msg.promptDebug) {
        const s = msg.replySource;
        if (s === "ollama" || s === "fallback" || s === "rules") {
          setExpandedPromptId(msg.id);
        }
      }
    },
    []
  );

  const getAvatarVizColorForSwitchboard = useCallback(
    (avatarId: string) =>
      getAvatarVizColor(avatarId, (id) =>
        fullAvatarCatalog.find((a) => a.id === id)
      ),
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
      fetchGmailRecent(contextEntryBudgets.emailFetchLimit)
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
  }, [contextTab, gmailConnected, contextEntryBudgets.emailFetchLimit]);

  useEffect(() => {
    if (contextTab === "calendar" && gmailConnected) {
      setCalendarLoading(true);
      setCalendarError(null);
      fetchCalendarUpcoming(
        contextEntryBudgets.calendarDays,
        contextEntryBudgets.calendarMaxResults
      )
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
  }, [
    contextTab,
    gmailConnected,
    contextEntryBudgets.calendarDays,
    contextEntryBudgets.calendarMaxResults,
  ]);

  useEffect(() => {
    if (contextTab === "contacts" && gmailConnected) {
      setContactsLoading(true);
      setContactsError(null);
      fetchContacts(contextEntryBudgets.contactsFetchLimit)
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
  }, [contextTab, gmailConnected, contextEntryBudgets.contactsFetchLimit]);

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

  const mergeAssignedTaskIdOntoAvatar = useCallback(
    (avatarId: string, taskId: string) => {
      const av = fullAvatarCatalog.find((a) => a.id === avatarId);
      if (!av) return;
      const prevIds = av.assignedTasks ?? [];
      if (prevIds.includes(taskId)) return;
      const assignedTasks = [...prevIds, taskId];
      if (isDefaultAvatarId(avatarId)) {
        const prev = situationContext.builtinAvatarEdits ?? {};
        const base = prev[avatarId] ?? av;
        patchSituationContext({
          builtinAvatarEdits: {
            ...prev,
            [avatarId]: { ...base, assignedTasks },
          },
        });
      } else {
        const userPrev = situationContext.userAvatars ?? [];
        const idx = userPrev.findIndex((a) => a.id === avatarId);
        if (idx >= 0) {
          const next = [...userPrev];
          next[idx] = { ...next[idx], assignedTasks };
          patchSituationContext({ userAvatars: next });
        }
      }
    },
    [
      fullAvatarCatalog,
      situationContext.builtinAvatarEdits,
      situationContext.userAvatars,
      patchSituationContext,
    ]
  );

  useEffect(() => {
    const onAssigned = (ev: Event) => {
      const detail = (ev as CustomEvent<{ avatarId: string; taskId: string }>)
        .detail;
      if (!detail?.avatarId || !detail.taskId) return;
      mergeAssignedTaskIdOntoAvatar(detail.avatarId, detail.taskId);
      setProjectsRefresh((n) => n + 1);
      refreshTasks();
    };
    /**
     * `AppContext` emits this after startup hygiene (prune + seed) or any
     * explicit rewrite of `world_metadata.projects` so the Assign-task memo
     * drops stale ghost ids from its dropdown.
     */
    const onWorldMetadataChanged = () => setProjectsRefresh((n) => n + 1);
    window.addEventListener("avatars:assigned-task", onAssigned);
    window.addEventListener(
      "avatars:world-metadata-changed",
      onWorldMetadataChanged
    );
    return () => {
      window.removeEventListener("avatars:assigned-task", onAssigned);
      window.removeEventListener(
        "avatars:world-metadata-changed",
        onWorldMetadataChanged
      );
    };
  }, [mergeAssignedTaskIdOntoAvatar, refreshTasks]);

  const handleAssignTask = useCallback(() => {
    /**
     * Prior implementation silently early-returned on every failure, which made
     * a no-op feel like "the dropdown is broken". Each branch now surfaces an
     * inline status line (and logs to console) so the reason is visible.
     */
    if (!firstSelectedId) {
      setTaskAssignStatus({ kind: "warn", text: "Select a primary avatar first." });
      return;
    }
    if (!taskProjectId) {
      setTaskAssignStatus({ kind: "warn", text: "Pick a project from the dropdown." });
      return;
    }
    /**
     * Re-read straight from the store in case seeding/pruning or another tab
     * mutated `world_metadata.projects` after `projectsList` was memoized.
     */
    const projects = getWorldMetadata().projects;
    const proj = projects[taskProjectId];
    if (!proj) {
      console.warn("[assign-task] selected project id missing from store", {
        taskProjectId,
        knownIds: Object.keys(projects),
      });
      setTaskAssignStatus({
        kind: "warn",
        text: "That project is no longer in storage. Pick another.",
      });
      setTaskProjectId("");
      setProjectsRefresh((n) => n + 1);
      return;
    }
    const title = proj.title?.trim();
    if (!title) {
      console.warn("[assign-task] project has empty title", { taskProjectId, proj });
      setTaskAssignStatus({
        kind: "warn",
        text: "That project has no title; edit it under Context → Projects.",
      });
      return;
    }
    const task = ensureProjectTaskForAvatar(firstSelectedId, taskProjectId);
    if (!task) {
      setTaskAssignStatus({
        kind: "warn",
        text: "Could not link that project (missing title or not in Context).",
      });
      return;
    }
    mergeAssignedTaskIdOntoAvatar(firstSelectedId, task.id);
    setTaskProjectId("");
    refreshTasks();
    const avatarName =
      fullAvatarCatalog.find((a) => a.id === firstSelectedId)?.givenName ?? "avatar";
    setTaskAssignStatus({
      kind: "ok",
      text: `Assigned “${title}” to ${avatarName}.`,
    });
  }, [
    taskProjectId,
    firstSelectedId,
    refreshTasks,
    mergeAssignedTaskIdOntoAvatar,
    fullAvatarCatalog,
  ]);

  /** Auto-clear the Assign-task status message so it doesn't linger. */
  useEffect(() => {
    if (!taskAssignStatus) return;
    const t = window.setTimeout(() => setTaskAssignStatus(null), 4000);
    return () => window.clearTimeout(t);
  }, [taskAssignStatus]);

  const handleEndTopicSegment = useCallback(() => {
    const users = situationContext.conversationThread.filter(
      (m) => m.role === "user"
    );
    const last = users[users.length - 1];
    if (!last) return;
    appendTopicSegment(buildTopicSegmentRecord(last.id, focus));
  }, [situationContext.conversationThread, focus]);

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
          <p className="subtitle">
            Local-first avatars with grounded Gmail, calendar, contacts, and
            world memory.
          </p>
          <ul
            className="header-capabilities"
            aria-label="Agent capabilities"
          >
            {AGENT_CAPABILITIES.map((c) => (
              <li key={c.label} title={c.detail}>
                {c.label}
              </li>
            ))}
          </ul>
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
            <button
              type="button"
              className={`avatar-detail-toggle behavior-panel-gear${
                behaviorPanelOpen ? " behavior-panel-gear--open" : ""
              }`}
              aria-expanded={behaviorPanelOpen}
              aria-controls="behavior-tuning-panel"
              title="Behavior — proactive notifications and reply balance"
              aria-label={
                behaviorPanelOpen ? "Close behavior settings" : "Open behavior settings"
              }
              onClick={() => setBehaviorPanelOpen((o) => !o)}
            >
              <span className="avatar-detail-toggle-icon" aria-hidden>
                &#9881;
              </span>
            </button>
          </div>
        </div>
        {behaviorPanelOpen && (
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
        )}
        {avatars.map((avatar, rosterIndex) => {
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
              }${executorAvatarId === avatar.id ? " is-executor" : ""}`}
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
                    onClick={() => handleMoveCoreRoster(avatar.id, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="avatar-roster-reorder-btn"
                    disabled={rosterIndex >= avatars.length - 1}
                    title="Move down in roster priority"
                    aria-label={`Move ${avatar.givenName} down in roster`}
                    onClick={() => handleMoveCoreRoster(avatar.id, 1)}
                  >
                    ↓
                  </button>
                </div>
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
        {popUpAvatarIds.length > 0 && (
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
              {popUpAvatarIds.map((id) => {
                const a = fullAvatarCatalog.find((x) => x.id === id);
                if (!a) return null;
                const src = getAvatarPortraitSrc(
                  situationContext.avatarPortraitSrcById,
                  a.id,
                  a.appearance?.portraitUrl
                );
                const initial = a.givenName.trim().charAt(0).toUpperCase() || "?";
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="avatar-popin-card avatar-popup-card"
                      aria-label={`Remove ${a.givenName} from Talk to selection`}
                      onClick={() => toggleAvatarSelection(id)}
                    >
                      <span className="avatar-portrait avatar-portrait--sm" aria-hidden>
                        {src ? (
                          <img src={src} alt="" className="avatar-portrait-img" />
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
        {situationContext.userFocus?.project?.id && popInAvatarIds.length > 0 && (
          <div className="avatar-popin-panel" role="region" aria-label="Project pop-in avatars">
            <h3 className="avatar-popin-title">Project team</h3>
            <p className="avatar-popin-hint">
              Managed avatars for this focus. Click to set executor (+1 roster once per focus per
              avatar).
            </p>
            <ul className="avatar-popin-list">
              {popInAvatarIds.map((id) => {
                const a = fullAvatarCatalog.find((x) => x.id === id);
                if (!a) return null;
                const src = getAvatarPortraitSrc(
                  situationContext.avatarPortraitSrcById,
                  a.id,
                  a.appearance?.portraitUrl
                );
                const initial = a.givenName.trim().charAt(0).toUpperCase() || "?";
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className={`avatar-popin-card${
                        situationContext.executorOverrideAvatarId === id ? " is-override" : ""
                      }`}
                      onClick={() => handlePopInAvatarClick(id)}
                    >
                      <span className="avatar-portrait avatar-portrait--sm" aria-hidden>
                        {src ? (
                          <img src={src} alt="" className="avatar-portrait-img" />
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
            {taskAssignStatus && (
              <p
                className={`task-assign-status task-assign-status--${taskAssignStatus.kind}`}
                role={taskAssignStatus.kind === "warn" ? "alert" : "status"}
              >
                {taskAssignStatus.text}
              </p>
            )}
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
      </aside>

      <main
        className={`chat-main${
          selectedAvatar
            ? ` chat-frame--${selectedAvatar.id.replace(/[^a-z0-9_-]/gi, "")}`
            : ""
        }`}
        style={
          {
            ["--user-chrome-color"]: userChromeColor,
          } as CSSProperties
        }
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
                    aria-label="Show Chat Visualizer column"
                  />
                  <span className="chat-view-mode-label-text">
                    Chat Visualizer
                  </span>
                </label>
                <label className="chat-view-mode-label chat-switchboard-viz-label">
                  <input
                    type="checkbox"
                    className="chat-switchboard-viz-check"
                    checked={showSourceCacheViz}
                    onChange={(e) => setShowSourceCacheViz(e.target.checked)}
                    aria-label="Show Storage visualizer column"
                  />
                  <span className="chat-view-mode-label-text">Storage viz</span>
                </label>
                <label className="chat-user-chrome-label">
                  <span className="chat-view-mode-label-text">You</span>
                  <input
                    type="color"
                    className="chat-user-chrome-swatch"
                    value={userChromeColor}
                    onChange={(e) => setUserChromeColor(e.target.value)}
                    aria-label="Color for your messages and Chat Visualizer user marker"
                    title="Color for your messages and Chat Visualizer user marker"
                  />
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
                <button
                  type="button"
                  className="end-topic-segment-btn"
                  onClick={handleEndTopicSegment}
                  disabled={
                    situationContext.conversationThread.filter((m) => m.role === "user")
                      .length === 0
                  }
                  title="Mark this topic as ended (distinct from Clear chat; archive kept)"
                >
                  End topic
                </button>
              </div>
            </div>

            <div className="chat-body-row">
            {showSwitchboardViz && wavesColumnVisible && (
              <>
                <aside
                  className="switchboard-viz-column"
                  style={{ width: chatVizWidthPx }}
                  aria-label="Chat Visualizer routing"
                >
                  <SwitchboardViz
                    entries={wavesQueue}
                    getAccentColor={getAvatarVizColorForSwitchboard}
                    motionTier={wavesMotionTier === "blink" ? "blink" : "full"}
                    reducedMotion={reducedMotion}
                    vizDebug={vizDebug}
                    rosterEmpty={avatars.length === 0}
                    onActivateUserMessage={(uid) => {
                      const row = chatMessagesRef.current?.querySelector(
                        `[data-message-id="${uid}"]`
                      );
                      row?.scrollIntoView({
                        block: "center",
                        behavior: "smooth",
                      });
                    }}
                  />
                </aside>
                <button
                  type="button"
                  className="chat-viz-resize-handle"
                  aria-label="Resize Chat Visualizer panel"
                  aria-orientation="vertical"
                  onPointerDown={onVizResizePointerDown}
                  onPointerMove={onVizResizePointerMove}
                  onPointerUp={onVizResizePointerUp}
                  onPointerCancel={onVizResizePointerUp}
                />
              </>
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
                  const hoverOneLine =
                    msg.role === "user"
                      ? turn
                        ? formatTurnMetaLine(turn)
                        : msg.content.trim().slice(0, 120)
                      : msg.role === "avatar"
                        ? `${sourceLabel || String(src)} · ${msg.avatarId ?? ""} · ${new Date(
                            msg.timestamp
                          ).toLocaleTimeString()}`
                        : "";
                  const compactPromptToolbar =
                    msg.role === "avatar" &&
                    msg.promptDebug &&
                    (src === "ollama" || src === "fallback");
                  return (
                    <div
                      key={msg.id}
                      className={`message-block message-block--interactive ${
                        msg.role === "user" ? "message-block-user" : "message-block-avatar"
                      } ${compactPromptToolbar ? "message-block-avatar--compact-prompt" : ""} ${sourceClass}`}
                      data-message-id={msg.id}
                      data-avatar-id={msg.role === "avatar" ? msg.avatarId : undefined}
                      onMouseEnter={() => setHoverMetaMessageId(msg.id)}
                      onMouseLeave={() =>
                        setHoverMetaMessageId((id) =>
                          id === msg.id ? null : id
                        )
                      }
                      onClick={(e) => {
                        const t = e.target as HTMLElement;
                        if (t.closest("button, a, input, textarea, select")) return;
                        handleMessageRowActivate(msg);
                      }}
                    >
                      {hoverMetaMessageId === msg.id && hoverOneLine && (
                        <div className="message-hover-meta" title={hoverOneLine}>
                          {hoverOneLine}
                        </div>
                      )}
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
                            {msg.synthetic && msg.monitorTag && (
                              <span
                                className="message-monitor-chip"
                                title={`System monitor: ${msg.monitorTag}`}
                              >
                                {msg.monitorTag}
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
                          } ${msg.synthetic ? "message-content--synthetic" : ""}`}
                        >
                          {msg.content}
                        </p>
                        {msg.synthetic && msg.syntheticActions && msg.syntheticActions.length > 0 && (
                          <div className="message-synthetic-actions">
                            {msg.syntheticActions.map((a) => (
                              <button
                                key={a.id}
                                type="button"
                                className="message-synthetic-action-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void runSyntheticAction(msg, a);
                                }}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        )}
                        {msg.role === "user" && msg.emailFocusArtifacts && (
                          <div className="message-email-focus-toolbar">
                            <span
                              className={`email-focus-chip email-focus-chip--cache-${
                                msg.emailFocusArtifacts.cacheHit ? "hit" : "miss"
                              }`}
                              title={
                                msg.emailFocusArtifacts.cacheHit
                                  ? "Summary from local cache"
                                  : "Summary computed this turn"
                              }
                            >
                              {msg.emailFocusArtifacts.cacheHit
                                ? "Cached summary"
                                : "New summary"}
                            </span>
                            <span
                              className={`email-focus-chip email-focus-chip--rel-${msg.emailFocusArtifacts.relevance}`}
                              title="Model estimate: is this focused email useful for your message?"
                            >
                              {msg.emailFocusArtifacts.relevance === "relevant"
                                ? "Email: relevant"
                                : msg.emailFocusArtifacts.relevance === "irrelevant"
                                  ? "Email: low relevance"
                                  : "Email: uncertain"}
                            </span>
                            {msg.emailFocusArtifacts.openUrl && (
                              <button
                                type="button"
                                className="message-email-gmail-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void openLink(msg.emailFocusArtifacts!.openUrl!);
                                }}
                              >
                                Open in Gmail
                              </button>
                            )}
                          </div>
                        )}
                        {msg.role === "avatar" &&
                          msg.promptDebug &&
                          (src === "ollama" || src === "fallback") && (
                          <div className="message-prompt-toolbar">
                            <div className="message-prompt-tools message-prompt-tools--row">
                              <button
                                type="button"
                                className={`message-prompt-toggle ${
                                  src === "fallback"
                                    ? "message-prompt-toggle--fallback"
                                    : "message-prompt-toggle--ollama"
                                }`}
                                aria-expanded={expandedPromptId === msg.id}
                                onClick={() =>
                                  setExpandedPromptId((id) =>
                                    id === msg.id ? null : msg.id
                                  )
                                }
                              >
                                <span className="message-prompt-toggle-icon" aria-hidden="true">
                                  {expandedPromptId === msg.id ? "▼" : "▶"}
                                </span>
                                <span>
                                  {src === "ollama"
                                    ? "Prompt sent to Ollama"
                                    : "Ollama generation failed"}
                                </span>
                              </button>
                            </div>
                            {msg.avatarId && (
                              <button
                                type="button"
                                className="message-feedback-btn message-feedback-btn--downrank"
                                title="This reply was unhelpful — lowers this avatar's automatic routing priority (local)"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const allIds = fullAvatarCatalog.map((a) => a.id);
                                  patchSituationContext({
                                    avatarRosterPriorityScoreById: applyUnhelpfulDecrement(
                                      situationContext.avatarRosterPriorityScoreById ?? {},
                                      msg.avatarId!,
                                      allIds
                                    ),
                                  });
                                  appendSessionLog("ui", "avatar_unhelpful_feedback", {
                                    level: "info",
                                    detail: msg.avatarId!,
                                  });
                                }}
                              >
                                Unhelpful reply
                              </button>
                            )}
                          </div>
                        )}
                        {msg.role === "avatar" &&
                          msg.promptDebug &&
                          (src === "ollama" || src === "fallback") &&
                          expandedPromptId === msg.id && (
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
                                  <summary>Model reply / tools parse</summary>
                                  <div className="message-prompt-parse-block">
                                    {msg.promptDebug.rawModelReply != null && (
                                      <>
                                        <div className="message-prompt-section-label">
                                          Raw model reply
                                        </div>
                                        <pre className="message-prompt-raw-model">
                                          {msg.promptDebug.rawModelReply}
                                        </pre>
                                      </>
                                    )}
                                    <div className="message-prompt-section-label">
                                      Parsed tool names (intent)
                                    </div>
                                    <p className="message-prompt-parse-line">
                                      {(msg.promptDebug.worldviewParsedToolIntentNames
                                        ?.length ?? 0) > 0
                                        ? msg.promptDebug.worldviewParsedToolIntentNames!.join(
                                            ", "
                                          )
                                        : "(none — no valid avatars_tools_v1 envelope)"}
                                    </p>
                                    <div className="message-prompt-section-label">
                                      Executed tools
                                    </div>
                                    <p className="message-prompt-parse-line">
                                      {(msg.promptDebug.worldviewExecutedToolNames
                                        ?.length ?? 0) > 0
                                        ? msg.promptDebug.worldviewExecutedToolNames!.join(
                                            ", "
                                          )
                                        : "(none)"}
                                    </p>
                                    {(msg.promptDebug.worldviewParseHints?.length ??
                                      0) > 0 && (
                                      <>
                                        <div className="message-prompt-section-label message-prompt-section-label--warn">
                                          Parse mismatch hints
                                        </div>
                                        <ul className="message-prompt-hints-list">
                                          {msg.promptDebug.worldviewParseHints!.map(
                                            (h, i) => (
                                              <li key={i}>{h}</li>
                                            )
                                          )}
                                        </ul>
                                        {msg.promptDebug.worldviewParseReason && (
                                          <p className="message-prompt-parse-reason">
                                            {msg.promptDebug.worldviewParseReason}
                                          </p>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </details>
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
                                        ).filter(
                                          ([k]) =>
                                            k !== "fullPrompt" &&
                                            k !== "rawModelReply"
                                        )
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
            {showSourceCacheViz && wavesColumnVisible && (
              <>
                <button
                  type="button"
                  className="chat-viz-resize-handle chat-viz-resize-handle--source-cache"
                  aria-label="Resize Storage visualizer panel"
                  aria-orientation="vertical"
                  onPointerDown={onSourceCacheVizResizePointerDown}
                  onPointerMove={onSourceCacheVizResizePointerMove}
                  onPointerUp={onSourceCacheVizResizePointerUp}
                  onPointerCancel={onSourceCacheVizResizePointerUp}
                />
                <aside
                  className="source-cache-viz-column"
                  style={{ width: sourceCacheVizWidthPx }}
                  aria-label="Storage and cache diagnostics"
                >
                  <SourceCacheViz
                    diagnostics={sourceCacheVizSnapshot.diagnostics}
                    parsedFallbackLines={
                      sourceCacheVizSnapshot.parsedFallbackLines
                    }
                    emailInsights={sourceCacheVizSnapshot.emailInsights}
                    worldMeta={sourceCacheVizSnapshot.worldMeta}
                    worldviewAuditTail={sourceCacheVizSnapshot.worldviewAuditTail}
                    wavesQueueLength={sourceCacheVizSnapshot.wavesQueueLength}
                    wavesStorageKey={sourceCacheVizSnapshot.wavesStorageKey}
                    lastUserEmailFocus={sourceCacheVizSnapshot.lastUserEmailFocus}
                    futureSources={sourceCacheVizSnapshot.futureSources}
                    onOpenWorldviewTab={openWorldviewTab}
                    fullAvatarCatalog={fullAvatarCatalog}
                  />
                </aside>
              </>
            )}
            </div>

            {(pendingTurnCount > 0 ||
              (showSwitchboardViz && wavesColumnVisible && vizDebug)) && (
              <div className="chat-pending-bar" role="status" aria-live="polite">
                {showSwitchboardViz && wavesColumnVisible && vizDebug && (() => {
                  const counts = countWavesQueueByKind(wavesQueue);
                  return (
                    <span className="chat-viz-debug" aria-hidden>
                      user:{counts.user} · wave:{counts.wave} · wv:
                      {counts.worldview}
                      {counts.toolError > 0 ? ` · err:${counts.toolError}` : ""}
                      {counts.systemCommand > 0
                        ? ` · cmd:${counts.systemCommand} [n:${counts.cmdNoTools} q:${counts.cmdQueued} v:${counts.cmdValidated} a:${counts.cmdApplied} f:${counts.cmdFailed}]`
                        : ""}
                    </span>
                  );
                })()}
                {pendingTurnCount > 0 && (
                  <>
                    <span className="chat-pending-icon" aria-hidden>
                      ⏳
                    </span>
                    <span className="chat-pending-text">
                      {pendingTurnCount === 1
                        ? "Reply in progress…"
                        : `${pendingTurnCount} replies in progress…`}
                    </span>
                  </>
                )}
              </div>
            )}

            <div
              className="chat-avatar-picker"
              role="group"
              aria-label="Choose avatars to address in your next message"
            >
              <span className="chat-avatar-picker-label">Talk to</span>
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
            className={`context-tab ${contextTab === "user" ? "active" : ""}`}
            onClick={() => setContextTab("user")}
            title="Your name, pronouns, and notes for prompts"
          >
            You
          </button>
          <button
            type="button"
            className={`context-tab ${contextTab === "worldview" ? "active" : ""}`}
            onClick={() => setContextTab("worldview")}
            title="Worldview tool audit (local)"
          >
            WV log
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
                <ul
                  className="email-list"
                  key={`email-insights-${recentEmails.map((x) => x.id).join("|")}|${messages.length}|${pendingTurnCount}`}
                >
                  {recentEmails.map((e) => {
                    const insight = peekEmailInsight(e.id);
                    return (
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
          {contextTab === "worldview" && (
            <div className="context-worldview-audit">
              <p className="context-projects-hint">
                Append-only log when avatars run structured tools (world metadata
                patches, Gmail body fetch, etc.). Stored locally. Use{" "}
                <strong>Revert bad patches</strong> when a row applied incorrect
                world metadata — it removes touched project/person ids and restores
                your profile if that tool ran.
              </p>
              {worldviewAuditRecords.length === 0 ? (
                <p className="context-empty">No entries yet.</p>
              ) : (
                <ul className="worldview-audit-list">
                  {worldviewAuditRecords.map((r) => {
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
                                    setFocus((f) => {
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
                                  setWorldviewAuditRefresh((n) => n + 1);
                                  setProjectsRefresh((n) => n + 1);
                                  setUserProfileRefresh((n) => n + 1);
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
          {contextTab === "user" && (
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
                  value={userDisplayName}
                  onChange={(e) => setUserDisplayName(e.target.value)}
                  placeholder="How you want to be addressed"
                  aria-label="Your display name"
                />
              </label>
              <label className="context-user-label">
                Pronouns
                <input
                  type="text"
                  className="context-projects-title-input"
                  value={userPronouns}
                  onChange={(e) => setUserPronouns(e.target.value)}
                  placeholder="e.g. they/them"
                  aria-label="Your pronouns"
                />
              </label>
              <label className="context-user-label">
                Notes
                <textarea
                  className="context-projects-notes-input"
                  value={userNotes}
                  onChange={(e) => setUserNotes(e.target.value)}
                  rows={3}
                  placeholder="Optional context for avatars"
                  aria-label="Notes about you"
                />
              </label>
              <button
                type="button"
                className="context-projects-add-btn"
                onClick={handleSaveUserProfile}
              >
                Save profile
              </button>
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
                  placeholder="Summary for prompts (optional)"
                  value={newProjectSummary}
                  onChange={(e) => setNewProjectSummary(e.target.value)}
                  rows={2}
                  aria-label="New project summary"
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
        {(() => {
          const depthKey =
            contextTab === "email" ||
            contextTab === "calendar" ||
            contextTab === "contacts" ||
            contextTab === "projects"
              ? contextTab
              : null;
          if (!depthKey) return null;
          const depthMap = situationContext.contextEntryDepth ?? {};
          const t = depthMap[depthKey] ?? 0;
          const readout =
            depthKey === "email"
              ? `${contextEntryBudgets.emailTopK} emails`
              : depthKey === "calendar"
                ? `${contextEntryBudgets.calendarTopK} events`
                : depthKey === "contacts"
                  ? `${contextEntryBudgets.contactsTopK} contacts`
                  : `${contextEntryBudgets.projectExtraTopK} extra`;
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
                    patchSituationContext({
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
        initialRosterScore={
          avatarBuilderInitial?.kind === "edit"
            ? getRosterScore(
                situationContext.avatarRosterPriorityScoreById,
                avatarBuilderInitial.avatar.id
              )
            : undefined
        }
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
