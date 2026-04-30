import {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent,
} from "react";
import { useApp } from "../context/useApp";
import { getTasksForAvatar } from "../services/longTermTasks";
import { ensureProjectTaskForAvatar } from "../services/projectAvatarLink";
import { describeFocusChange } from "../services/focusWatcher";
import {
  appendTopicSegment,
  buildTopicSegmentRecord,
} from "../services/conversationSegments";
import { useSpeechToText } from "../hooks/useSpeechToText";
import {
  isGmailEnabled,
  hasGmailTokens,
  startGmailOAuth,
  getGmailCredentialsPath,
  getTauriEnv,
  fetchGmailRecent,
  fetchCalendarUpcoming,
  fetchContacts,
} from "../connectors/gmail";
import type { EmailItem, CalendarEvent, Contact } from "../connectors/types";
import type {
  SituationFocus,
  CompactTurnRecord,
  ChatViewMode,
  PendingNotification,
  BehaviorTuning,
  Avatar,
  AvatarCreationWorkshopIntent,
  ConversationMessage,
} from "../types";
import {
  DEFAULT_PROACTIVE_MIN_COMBINED_SCORE,
  DEFAULT_PROACTIVE_MIN_AFFINITY_BONUS,
  DEFAULT_REPLY_CONTEXT_FOCUS,
  DEFAULT_USER_ENGAGEMENT_LEVEL,
} from "../services/behaviorTuningFormat";
import type { ChatWindowStyleId, PersonalityTraitId } from "../theme/designTokens";
import { CHAT_WINDOW_STYLE_IDS, CHAT_SKIN_STORAGE_KEY } from "../theme/designTokens";
import {
  type AvatarBuilderInitial,
} from "../components/AvatarBuilderModal";
import { loadArchive } from "../services/turnArchive";
import {
  getOllamaModelNames,
  getOllamaPresence,
  type OllamaPresence,
} from "../services/ollama";
import { resolveContextEntryBudgets } from "../utils/contextEntryBudget";
import {
  appendSessionLog,
  initSessionLogDisk,
  type SessionLogDiskInfo,
} from "../services/sessionLog";
import {
  WAVES_BLINK_ONLY_MAX_WIDTH_PX,
  WAVES_COLUMN_HIDE_MAX_WIDTH_PX,
  WAVES_QUEUE_STORAGE_KEY,
} from "../services/switchboardWavesQueue";
import { parseRankedEmailLinesFromRelevantData } from "../services/sourceCacheViz";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import {
  getWorldMetadata,
  patchUserProfile,
} from "../services/worldMetadata";
import {
  getPlatformStore,
  subscribePlatformStore,
  updateTaskWorkflow,
} from "../services/platform/store";
import {
  emitSessionChangeDelta,
  subscribeSessionChangeDelta,
} from "../services/sessionChangeTelemetry";
import { isSystemAvatarId } from "../services/platform/routing";
import { patchWorldMetadataProjectsForExecution } from "../services/projectSync";
import { loadWorldviewAudit } from "../services/worldviewAudit";
import { executeAvatarCreationTaskById } from "../services/avatarCreationTaskExecution";
import {
  applyScoreDeltaWithCap,
  listPopInAvatarIdsForProjectFocus,
  resolveExecutorAvatarId,
  scoresFromCoreOrder,
} from "../services/avatarRoster";
import {
  MAX_PRIMARY_SLOTS,
  resolvePrimarySlotCount,
} from "../store/primaryRoster";
import { isDefaultAvatarId } from "../store/avatarCatalog";
import {
  readPortraitFileAsDataUrl,
  MAX_PORTRAIT_FILE_BYTES,
  normalizeAvatarPortraitPosition,
  normalizeAvatarPortraitScale,
  type AvatarPortraitPosition,
} from "../services/avatarPortrait";
import { getAvatarVizColor } from "../services/avatarVizColor";
import { loadEmailInsightsDoc } from "../services/emailInsights";
import {
  CHAT_VIZ_WIDTH_DEFAULT,
  CHAT_VIZ_WIDTH_MAX,
  CHAT_VIZ_WIDTH_MIN,
  CHAT_VIZ_WIDTH_STORAGE_KEY,
  FUTURE_SOURCE_COLUMNS,
  SOURCE_CACHE_VIZ_STORAGE_KEY,
  SOURCE_CACHE_VIZ_WIDTH_STORAGE_KEY,
  SWITCHBOARD_VIZ_STORAGE_KEY,
  USER_CHROME_BY_SKIN_STORAGE_KEY,
  USER_CHROME_STORAGE_KEY,
  isValidUserChromeColor,
  readUserChromeColorBySkin,
  resolveUserChromeColorForSkin,
  serializeUserChromeColorBySkin,
} from "./appChromeConstants";

export type AvatarDetailTabId = "match" | "bio" | "rules";

const CONTACTS_PANEL_FETCH_LIMIT = 1000;

export function useAppContentModel() {
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
    registerAvatarCreationWorkshopIntentHandler,
  } = useApp();

  const contextEntryBudgets = useMemo(
    () => resolveContextEntryBudgets(situationContext.contextEntryDepth),
    [situationContext.contextEntryDepth]
  );

  const reducedMotion = usePrefersReducedMotion();
  /**
   * Visualizer column expansion state:
   * - true  => expanded panel
   * - false => collapsed rail (still visible/toggleable when columns are enabled by viewport)
   */
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

  /**
   * Storage column expansion state:
   * - true  => expanded panel
   * - false => collapsed rail (still visible/toggleable when columns are enabled by viewport)
   */
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
  /** Selected project id for the ASSIGN PROJECT OWNER sidebar dropdown. */
  const [taskProjectId, setTaskProjectId] = useState("");
  /**
   * Transient status line for the ASSIGN PROJECT OWNER widget: confirmation
   * after a successful assign and diagnostics when the handler would otherwise
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

  const handleOpenAvatarBuilderFromInternet = useCallback(
    (payload: { initial: AvatarBuilderInitial }) => {
      setAvatarBuilderInitial(payload.initial);
      setAvatarBuilderOpen(true);
    },
    []
  );

  const handleAvatarBuilderSave = useCallback(
    (payload: {
      avatar: Avatar;
      rosterScore: number;
      seedPortraitDataUrl?: string | null;
      portraitPosition?: AvatarPortraitPosition;
      portraitScale?: number;
    }) => {
      const {
        avatar,
        rosterScore,
        seedPortraitDataUrl,
        portraitPosition,
        portraitScale,
      } = payload;
      const nextScores = {
        ...(situationContext.avatarRosterPriorityScoreById ?? {}),
      };
      nextScores[avatar.id] = Math.max(
        0,
        Math.min(100, Math.round(rosterScore))
      );
      const portraitCtx =
        seedPortraitDataUrl != null && seedPortraitDataUrl !== ""
          ? {
              avatarPortraitSrcById: {
                ...(situationContext.avatarPortraitSrcById ?? {}),
                [avatar.id]: seedPortraitDataUrl,
              },
            }
          : {};
      const portraitPositionCtx =
        portraitPosition != null
          ? {
              avatarPortraitPositionById: {
                ...(situationContext.avatarPortraitPositionById ?? {}),
                [avatar.id]: normalizeAvatarPortraitPosition(portraitPosition),
              },
            }
          : {};
      const portraitScaleCtx =
        portraitScale != null
          ? {
              avatarPortraitScaleById: {
                ...(situationContext.avatarPortraitScaleById ?? {}),
                [avatar.id]: normalizeAvatarPortraitScale(portraitScale),
              },
            }
          : {};
      if (isDefaultAvatarId(avatar.id)) {
        const prev = situationContext.builtinAvatarEdits ?? {};
        patchSituationContext({
          builtinAvatarEdits: { ...prev, [avatar.id]: avatar },
          avatarRosterPriorityScoreById: nextScores,
          ...portraitCtx,
          ...portraitPositionCtx,
          ...portraitScaleCtx,
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
          ...portraitCtx,
          ...portraitPositionCtx,
          ...portraitScaleCtx,
        });
      } else {
        patchSituationContext({
          userAvatars: [...userPrev, avatar],
          avatarRosterPriorityScoreById: nextScores,
          ...portraitCtx,
          ...portraitPositionCtx,
          ...portraitScaleCtx,
        });
      }
      emitSessionChangeDelta(1);
    },
    [
      situationContext.userAvatars,
      situationContext.builtinAvatarEdits,
      situationContext.avatarRosterPriorityScoreById,
      situationContext.avatarPortraitSrcById,
      situationContext.avatarPortraitPositionById,
      situationContext.avatarPortraitScaleById,
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
    | "internet"
    | "tasks"
    | "user"
    | "worldview"
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
  const WORKSHOP_TAB_STORAGE_KEY = "avatars_workshop_subtab";
  type WorkshopTab =
    | "tool"
    | "unmet"
    | "source"
    | "projects"
    | "creation"
    | "stewardship";
  const [mainSurface, setMainSurface] = useState<"chat" | "workshops">("chat");
  const [talkToTrayOpen, setTalkToTrayOpen] = useState(true);
  const [sessionChangeCount, setSessionChangeCount] = useState(0);

  const resetSessionChangeCount = useCallback(() => {
    setSessionChangeCount(0);
  }, []);

  useEffect(() => {
    return subscribeSessionChangeDelta((d) =>
      setSessionChangeCount((c) => c + d)
    );
  }, []);

  const clearChatAndResetSessionCounter = useCallback(() => {
    resetSessionChangeCount();
    clearChat();
  }, [clearChat, resetSessionChangeCount]);

  const [workshopTab, setWorkshopTabState] = useState<WorkshopTab>(() => {
    try {
      const s = sessionStorage.getItem(WORKSHOP_TAB_STORAGE_KEY);
      if (
        s === "tool" ||
        s === "unmet" ||
        s === "source" ||
        s === "projects" ||
        s === "creation" ||
        s === "stewardship"
      )
        return s;
    } catch {
      /* ignore */
    }
    return "tool";
  });
  const [creationWorkshopPrefill, setCreationWorkshopPrefill] =
    useState<AvatarCreationWorkshopIntent | null>(null);
  const setWorkshopTab = useCallback((t: WorkshopTab) => {
    setWorkshopTabState(t);
    if (t !== "creation") {
      setCreationWorkshopPrefill(null);
    }
    try {
      sessionStorage.setItem(WORKSHOP_TAB_STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    registerAvatarCreationWorkshopIntentHandler((intent) => {
      if (!intent.seedText?.trim() && !intent.wikiQuery?.trim()) return;
      setMainSurface("workshops");
      setWorkshopTab("creation");
      setCreationWorkshopPrefill(intent);
    });
    return () => registerAvatarCreationWorkshopIntentHandler(null);
  }, [registerAvatarCreationWorkshopIntentHandler, setWorkshopTab]);

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
  const [userChromeColorBySkin, setUserChromeColorBySkin] = useState(() => {
    try {
      return readUserChromeColorBySkin(localStorage);
    } catch {
      return {};
    }
  });
  const userChromeColor = resolveUserChromeColorForSkin(
    userChromeColorBySkin,
    chatSkin
  );
  const setUserChromeColor = useCallback(
    (color: string) => {
      if (!isValidUserChromeColor(color)) return;
      setUserChromeColorBySkin((prev) => ({ ...prev, [chatSkin]: color }));
    },
    [chatSkin]
  );
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
        avatarPortraitPositionById: {
          ...(situationContext.avatarPortraitPositionById ?? {}),
          [avatarId]: { x: 50, y: 50 },
        },
        avatarPortraitScaleById: {
          ...(situationContext.avatarPortraitScaleById ?? {}),
          [avatarId]: 1,
        },
      });
    },
    [
      patchSituationContext,
      situationContext.avatarPortraitSrcById,
      situationContext.avatarPortraitPositionById,
      situationContext.avatarPortraitScaleById,
    ]
  );

  const clearPortrait = useCallback(
    (avatarId: string) => {
      setPortraitFileError(null);
      const prev = situationContext.avatarPortraitSrcById ?? {};
      const prevPosition = situationContext.avatarPortraitPositionById ?? {};
      const prevScale = situationContext.avatarPortraitScaleById ?? {};
      if (!(avatarId in prev) && !(avatarId in prevPosition) && !(avatarId in prevScale))
        return;
      const next = { ...prev };
      delete next[avatarId];
      const nextPosition = { ...prevPosition };
      delete nextPosition[avatarId];
      const nextScale = { ...prevScale };
      delete nextScale[avatarId];
      patchSituationContext({
        avatarPortraitSrcById: Object.keys(next).length > 0 ? next : undefined,
        avatarPortraitPositionById:
          Object.keys(nextPosition).length > 0 ? nextPosition : undefined,
        avatarPortraitScaleById:
          Object.keys(nextScale).length > 0 ? nextScale : undefined,
      });
    },
    [
      patchSituationContext,
      situationContext.avatarPortraitSrcById,
      situationContext.avatarPortraitPositionById,
      situationContext.avatarPortraitScaleById,
    ]
  );

  /** Sidebar: which avatar shows the magnifier detail panel. */
  const [avatarDetailExpandedId, setAvatarDetailExpandedId] = useState<string | null>(
    null
  );
  /** Shared tab selection for all avatar detail panels. */
  const [avatarDetailActiveTab, setAvatarDetailActiveTab] =
    useState<AvatarDetailTabId>("match");
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
  /** True when the selected primary avatar cannot hold `ownerAvatarId` (system-tagged). */
  const assignProjectOwnerUiMuted = useMemo(
    () => !!(firstSelectedId && isSystemAvatarId(firstSelectedId, fullAvatarCatalog)),
    [firstSelectedId, fullAvatarCatalog]
  );
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
    const merged = new Map<string, { title: string; summary?: string }>();
    for (const [id, p] of Object.entries(getPlatformStore().projects)) {
      if (!p.title?.trim() || p.status === "archived") continue;
      merged.set(id, { title: p.title, summary: p.summary });
    }
    for (const [id, p] of Object.entries(getWorldMetadata().projects)) {
      if (!p.title?.trim()) continue;
      merged.set(id, {
        title: p.title,
        summary: p.summary ?? merged.get(id)?.summary,
      });
    }
    return [...merged.entries()].sort((a, b) =>
      a[1].title.localeCompare(b[1].title, undefined, { sensitivity: "base" })
    );
  }, [projectsRefresh]);

  /**
   * Projects the user may assign as **project owner** (`ownerAvatarId`): active
   * platform rows with no owner, plus world-metadata-only ids (no platform row).
   * Does not use long-term task rows as a filter — eligibility is ownership only.
   */
  const assignableProjectsList = useMemo(() => {
    void projectsRefresh;
    const store = getPlatformStore();
    const merged = new Map<string, { title: string; summary?: string }>();
    for (const [id, p] of Object.entries(store.projects)) {
      if (!p.title?.trim()) continue;
      if (p.status !== "active") continue;
      if (p.ownerAvatarId?.trim()) continue;
      merged.set(id, { title: p.title, summary: p.summary });
    }
    for (const [id, p] of Object.entries(getWorldMetadata().projects)) {
      if (!p.title?.trim()) continue;
      if (store.projects[id]) continue;
      merged.set(id, { title: p.title, summary: p.summary });
    }
    return [...merged.entries()].sort((a, b) =>
      a[1].title.localeCompare(b[1].title, undefined, { sensitivity: "base" })
    );
  }, [projectsRefresh]);

  const completedProjectsList = useMemo(() => {
    void projectsRefresh;
    return Object.entries(getPlatformStore().projects)
      .filter(([, p]) => p.title?.trim() && (p.status === "done" || p.status === "archived"))
      .map(([id, p]) => [id, { title: p.title, summary: p.summary }] as const)
      .sort((a, b) =>
        a[1].title.localeCompare(b[1].title, undefined, { sensitivity: "base" })
      );
  }, [projectsRefresh]);

  const contextTasks = useMemo(() => {
    void projectsRefresh;
    const store = getPlatformStore();
    return Object.values(store.tasks)
      .filter((t) => t.status !== "done" && t.status !== "cancelled")
      .sort((a, b) => {
        const aProject = store.projects[a.projectId]?.title ?? "";
        const bProject = store.projects[b.projectId]?.title ?? "";
        return (
          aProject.localeCompare(bProject, undefined, { sensitivity: "base" }) ||
          b.updatedAt - a.updatedAt ||
          a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
        );
      });
  }, [projectsRefresh]);

  const contextProjectTitleById = useMemo(() => {
    void projectsRefresh;
    const store = getPlatformStore();
    return Object.fromEntries(
      Object.entries(store.projects).map(([id, p]) => [id, p.title])
    );
  }, [projectsRefresh]);

  const focusPlatformTask = useCallback((taskId: string) => {
    const store = getPlatformStore();
    const task = store.tasks[taskId];
    if (!task) return;
    const project = store.projects[task.projectId];
    setFocus((f) => ({
      ...f,
      project: project ? { id: project.id, title: project.title } : f.project,
      task: { id: task.id, title: task.title },
    }));
  }, []);

  const cancelPlatformTask = useCallback((taskId: string) => {
    const task = getPlatformStore().tasks[taskId];
    if (!task) return;
    updateTaskWorkflow({
      taskId,
      actor: "user",
      workflowStatus: "cancelled",
      nextActor: null,
      detail: "cancelled from Context Tasks tab",
    });
    setFocus((f) =>
      f.task?.id === taskId ? { ...f, task: undefined } : f
    );
    setProjectsRefresh((n) => n + 1);
  }, []);

  const executePlatformTask = useCallback((taskId: string): boolean => {
    const ok = executeAvatarCreationTaskById(taskId);
    if (ok) {
      focusPlatformTask(taskId);
      setProjectsRefresh((n) => n + 1);
    }
    return ok;
  }, [focusPlatformTask]);

  useEffect(() => {
    return subscribePlatformStore(() => setProjectsRefresh((n) => n + 1));
  }, []);

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
    patchWorldMetadataProjectsForExecution({
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
    patchWorldMetadataProjectsForExecution({ [id]: null });
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
    try {
      localStorage.setItem(
        USER_CHROME_BY_SKIN_STORAGE_KEY,
        serializeUserChromeColorBySkin(userChromeColorBySkin)
      );
      localStorage.setItem(USER_CHROME_STORAGE_KEY, userChromeColor);
    } catch {
      /* ignore */
    }
  }, [userChromeColor, userChromeColorBySkin]);

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
      fetchContacts(
        Math.max(contextEntryBudgets.contactsFetchLimit, CONTACTS_PANEL_FETCH_LIMIT)
      )
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
    const exists = assignableProjectsList.some(([id]) => id === taskProjectId);
    if (!exists) setTaskProjectId("");
  }, [assignableProjectsList, taskProjectId]);

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
     * `AppProvider` emits this after startup hygiene (prune + seed) or any
     * explicit rewrite of `world_metadata.projects` so the project-ownership
     * assignable list drops stale ghost ids.
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
     * Assigns **project ownership** to the selected avatar (platform `ownerAvatarId`
     * plus long-term task). Prior implementation silently early-returned on failures,
     * which made a no-op feel broken; each branch surfaces an inline status line
     * (and logs to console) so the reason is visible.
     */
    if (!firstSelectedId) {
      setTaskAssignStatus({ kind: "warn", text: "Select a primary avatar first." });
      return;
    }
    if (isSystemAvatarId(firstSelectedId, fullAvatarCatalog)) {
      setTaskAssignStatus({
        kind: "warn",
        text: "System avatars cannot be project owners. Pick a roster avatar.",
      });
      return;
    }
    if (!taskProjectId) {
      setTaskAssignStatus({
        kind: "warn",
        text: "Pick a project for ownership assignment.",
      });
      return;
    }
    /**
     * Re-read straight from the store in case seeding/pruning or another tab
     * mutated platform/world projects after `projectsList` was memoized.
     */
    const worldProjects = getWorldMetadata().projects;
    const platformProjects = getPlatformStore().projects;
    const proj = worldProjects[taskProjectId] ?? platformProjects[taskProjectId];
    if (!proj) {
      console.warn("[assign-project-owner] selected project id missing from store", {
        taskProjectId,
        knownWorldIds: Object.keys(worldProjects),
        knownPlatformIds: Object.keys(platformProjects),
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
      console.warn("[assign-project-owner] project has empty title", { taskProjectId, proj });
      setTaskAssignStatus({
        kind: "warn",
        text: "That project has no title; edit it under Workshops → Projects.",
      });
      return;
    }
    const task = ensureProjectTaskForAvatar(firstSelectedId, taskProjectId);
    if (!task) {
      setTaskAssignStatus({
        kind: "warn",
        text: "Could not link that project (missing title or not in storage).",
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
      text: `Assigned project ownership of “${title}” to ${avatarName}.`,
    });
  }, [
    taskProjectId,
    firstSelectedId,
    fullAvatarCatalog,
    refreshTasks,
    mergeAssignedTaskIdOntoAvatar,
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
    resetSessionChangeCount();
    appendTopicSegment(buildTopicSegmentRecord(last.id, focus));
  }, [situationContext.conversationThread, focus, resetSessionChangeCount]);

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

  return {
    archivedTurnCount,
    avatarBuilderInitial,
    avatarBuilderOpen,
    avatarDetailActiveTab,
    avatarDetailExpandedId,
    avatarPendingListOpenId,
    avatars,
    behaviorPanelOpen,
    behaviorTuning,
    calendarError,
    calendarLoading,
    chatMessagesRef,
    chatSelectionLabel,
    chatSkin,
    chatViewMode,
    chatVizWidthPx,
    clearAvatarSelection,
    clearChat: clearChatAndResetSessionCounter,
    clearPortrait,
    contacts,
    contactsError,
    contactsLoading,
    contextEntryBudgets,
    contextProjectTitleById,
    contextTab,
    contextTasks,
    completedProjectsList,
    creationWorkshopPrefill,
    effectivePrimarySlots,
    emailError,
    emailsLoading,
    envTauri,
    executorAvatarId,
    expandedPromptId,
    firstSelectedId,
    focus,
    focusPlatformTask,
    focusWatcherBoot,
    fullAvatarCatalog,
    getAvatarVizColorForSwitchboard,
    gmailConnected,
    gmailConnecting,
    gmailCredsPath,
    gmailError,
    gmailHasCreds,
    handleAddWorldProject,
    handleAssignTask,
    handleAvatarBuilderSave,
    handleConnectGmail,
    handleEndTopicSegment,
    handleKeyDown,
    handleMessageRowActivate,
    handleMoveCoreRoster,
    handlePopInAvatarClick,
    handlePortraitFileChange,
    handleRemoveWorldProject,
    handleSaveUserProfile,
    handleSend,
    handleWellOfSoulsAfterGenerate,
    handleOpenAvatarBuilderFromInternet,
    hoverMetaMessageId,
    inputValue,
    maxPrimarySlotOptions,
    mergeAssignedTaskIdOntoAvatar,
    mainSurface,
    workshopTab,
    messageIdsKey,
    messagePlaceholder,
    messages,
    newProjectNotes,
    newProjectSummary,
    newProjectTitle,
    ollamaLastCheckedAt,
    ollamaModels,
    ollamaPresence,
    onSourceCacheVizResizePointerDown,
    onSourceCacheVizResizePointerMove,
    onSourceCacheVizResizePointerUp,
    onVizResizePointerDown,
    onVizResizePointerMove,
    onVizResizePointerUp,
    openPortraitFilePicker,
    openWorldviewTab,
    patchBehaviorTuning,
    patchSituationContext,
    pendingByAvatar,
    pendingTurnCount,
    popInAvatarIds,
    popInScoreBumpedRef,
    popUpAvatarIds,
    portraitFileError,
    portraitFileInputRef,
    portraitPickAvatarIdRef,
    prevFocusRef,
    primaryCatalogLen,
    proactiveMinAffinity,
    proactiveMinCombined,
    assignProjectOwnerUiMuted,
    assignableProjectsList,
    projectsList,
    projectsRefresh,
    recentEmails,
    reducedMotion,
    refreshOllama,
    refreshTasks,
    replyContextFocus,
    selectedAvatar,
    selectedAvatarIds,
    selectedIdsKey,
    sendMessage,
    sessionChangeCount,
    sessionDiskInfo,
    sessionLogOpen,
    setAvatarBuilderInitial,
    setAvatarBuilderOpen,
    setAvatarDetailActiveTab,
    setAvatarDetailExpandedId,
    setAvatarPendingListOpenId,
    setBehaviorPanelOpen,
    setCalendarError,
    setCalendarLoading,
    setChatSkin,
    setChatViewMode,
    setChatVizWidthPx,
    setMainSurface,
    setWorkshopTab,
    setContacts,
    setContactsError,
    setContactsLoading,
    setContextTab,
    setEmailError,
    setEmailsLoading,
    setEnvTauri,
    setExpandedPromptId,
    setFocus,
    setGmailConnected,
    setGmailConnecting,
    setGmailCredsPath,
    setGmailError,
    setGmailHasCreds,
    setHoverMetaMessageId,
    setInputValue,
    setNewProjectNotes,
    setNewProjectSummary,
    setNewProjectTitle,
    setOllamaLastCheckedAt,
    setOllamaModels,
    setOllamaPresence,
    setPortraitFileError,
    setProjectsRefresh,
    setRecentEmails,
    setSelectedAvatarIds,
    setSessionDiskInfo,
    setSessionLogOpen,
    setShowSourceCacheViz,
    setShowSwitchboardViz,
    setSourceCacheVizWidthPx,
    setTalkToTrayOpen,
    setTaskAssignStatus,
    setTaskProjectId,
    setTasks,
    setUpcomingEvents,
    setUserChromeColor,
    setUserDisplayName,
    setUserNotes,
    setUserPaths,
    setUserProfileRefresh,
    setUserPronouns,
    setViewportWidth,
    setVizDebug,
    setWorldviewAuditRefresh,
    showSourceCacheViz,
    showSwitchboardViz,
    situationContext,
    sourceCacheVizResizeDragRef,
    sourceCacheVizSnapshot,
    sourceCacheVizWidthPx,
    speech,
    talkToTrayOpen,
    taskAssignAvatar,
    taskAssignStatus,
    taskProjectId,
    tasks,
    cancelPlatformTask,
    executePlatformTask,
    toggleAvatarSelection,
    turnByUserId,
    upcomingEvents,
    userChromeColor,
    userDisplayName,
    userEngagement,
    userMoodNote,
    userNotes,
    userPaths,
    userProfileRefresh,
    userPronouns,
    viewportWidth,
    vizDebug,
    vizResizeDragRef,
    wavesColumnVisible,
    wavesMotionTier,
    wavesQueue,
    worldviewAuditRecords,
    worldviewAuditRefresh,
  };
}



export type AppContentViewValue = ReturnType<typeof useAppContentModel>;
