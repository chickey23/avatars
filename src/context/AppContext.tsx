import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type {
  SituationContext,
  SituationFocus,
  ConversationMessage,
  SwitchboardTraceStep,
} from "../types";
import {
  AppContext,
  type SendMessageOptions,
  type AppContextValue,
} from "./app-context";
import { appendToConversation } from "../services/situationContext";
import {
  getInitialState,
  processUserTurn,
  type UserTurnJob,
  clearChat as storeClearChat,
  patchSituationContext as storePatchSituationContext,
  writePersistedContext,
} from "../store/appStore";
import { gatherDataFromSources } from "../connectors";
import { resolveContextEntryBudgets } from "../utils/contextEntryBudget";
import { mergeProactiveEvaluation } from "../services/pendingNotifications";
import { ensureWorldMetadataLoaded } from "../services/worldMetadata/store";
import { resolvePrimarySlotCount } from "../store/primaryRoster";
import { getFullAvatarCatalog } from "../store/avatarCatalog";
import { getSortedCoreAvatars } from "../services/avatarRoster";
import {
  WAVES_QUEUE_SCHEMA_VERSION,
  appendSystemCommandEntry,
  appendToolResolutionErrorEntry,
  appendTraceDelta,
  appendUserEntry,
  appendWorldviewEntry,
  countWaveEntriesForUser,
  createEmptyWavesQueueDoc,
  loadWavesQueueFromStorage,
  markWavesSettledForUser,
  markWaveSettledForUserDepth,
  saveWavesQueueToStorage,
} from "../services/switchboardWavesQueue";
import type { WavesQueueEntry } from "../services/switchboardWavesQueue";
import { appendSessionLog } from "../services/sessionLog";

export type { SendMessageOptions } from "./app-context";

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(getInitialState);
  const [pendingTurnCount, setPendingTurnCount] = useState(0);
  const [processingUserMessageId, setProcessingUserMessageId] = useState<
    string | null
  >(null);
  const [liveSwitchboardTrace, setLiveSwitchboardTrace] = useState<
    SwitchboardTraceStep[]
  >([]);
  const [wavesQueue, setWavesQueue] = useState<WavesQueueEntry[]>(() =>
    loadWavesQueueFromStorage().entries
  );
  const persistWavesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const schedulePersistWaves = useCallback((entries: WavesQueueEntry[]) => {
    if (persistWavesTimerRef.current) clearTimeout(persistWavesTimerRef.current);
    persistWavesTimerRef.current = setTimeout(() => {
      persistWavesTimerRef.current = null;
      saveWavesQueueToStorage({
        schemaVersion: WAVES_QUEUE_SCHEMA_VERSION,
        entries,
      });
    }, 120);
  }, []);

  const fullAvatarCatalog = useMemo(
    () => getFullAvatarCatalog(state.situationContext),
    [state.situationContext.userAvatars]
  );
  const rosterScoresKey = JSON.stringify(
    state.situationContext.avatarRosterPriorityScoreById ?? {}
  );
  const slotCount = resolvePrimarySlotCount(
    state.situationContext,
    fullAvatarCatalog.length
  );
  const avatars = useMemo(() => {
    const core = getSortedCoreAvatars(
      fullAvatarCatalog,
      state.situationContext.avatarRosterPriorityScoreById,
      slotCount
    );
    /** One roster card: mirror Talk-to choice so the sidebar shows who you selected. */
    if (
      slotCount === 1 &&
      state.selectedAvatarIds.length === 1
    ) {
      const only = state.selectedAvatarIds[0]!;
      const hit = fullAvatarCatalog.find((a) => a.id === only);
      if (hit) return [hit];
    }
    return core;
  }, [
    fullAvatarCatalog,
    slotCount,
    rosterScoresKey,
    state.selectedAvatarIds,
  ]);

  const situationContextRef = useRef(state.situationContext);
  const selectedAvatarIdsRef = useRef(state.selectedAvatarIds);
  const queueRef = useRef<UserTurnJob[]>([]);
  /** Serializes drain so concurrent sends all await full processing. */
  const drainChainRef = useRef(Promise.resolve());

  useEffect(() => {
    situationContextRef.current = state.situationContext;
  }, [state.situationContext]);
  useEffect(() => {
    selectedAvatarIdsRef.current = state.selectedAvatarIds;
  }, [state.selectedAvatarIds]);

  /**
   * Drop selections for avatars no longer in the full catalog. Non-primary
   * selections (made via "Talk to") remain and surface as pop-up avatars in
   * the sidebar.
   */
  useEffect(() => {
    const allowed = new Set(fullAvatarCatalog.map((a) => a.id));
    setState((prev) => {
      const next = prev.selectedAvatarIds.filter((id) => allowed.has(id));
      if (next.length === prev.selectedAvatarIds.length) return prev;
      return { ...prev, selectedAvatarIds: next };
    });
  }, [fullAvatarCatalog]);

  useEffect(() => {
    ensureWorldMetadataLoaded();
  }, []);

  /** Non-blocking proactive notification refresh after connector-style data changes. */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const data = await gatherDataFromSources(
          resolveContextEntryBudgets(
            situationContextRef.current.contextEntryDepth
          )
        );
        if (cancelled) return;
        setState((prev) => {
          const cat = getFullAvatarCatalog(prev.situationContext);
          const sc = resolvePrimarySlotCount(prev.situationContext, cat.length);
          const primaryAvatars = getSortedCoreAvatars(
            cat,
            prev.situationContext.avatarRosterPriorityScoreById,
            sc
          );
          const merged = mergeProactiveEvaluation(
            data,
            prev.situationContext,
            primaryAvatars,
            prev.situationContext.userFocus
          );
          situationContextRef.current = merged;
          writePersistedContext(merged);
          return { ...prev, situationContext: merged };
        });
      } catch {
        /* offline / Tauri unavailable */
      }
    };
    void run();
    const id = window.setInterval(run, 90_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    state.situationContext.contextEntryDepth?.email,
    state.situationContext.contextEntryDepth?.calendar,
    state.situationContext.contextEntryDepth?.contacts,
    state.situationContext.contextEntryDepth?.projects,
    state.situationContext.userFocus?.project?.id,
    rosterScoresKey,
  ]);

  const handleSendMessage = useCallback(
    async (
      content: string,
      focus?: SituationFocus,
      options?: SendMessageOptions
    ) => {
      if (!content.trim()) return;
      const userMsg: ConversationMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: content.trim(),
        timestamp: Date.now(),
      };
      setState((prev) => {
        const next = appendToConversation(prev.situationContext, userMsg);
        situationContextRef.current = next;
        return { ...prev, situationContext: next };
      });
      setWavesQueue((prev) => {
        const next = appendUserEntry(prev, userMsg.id);
        schedulePersistWaves(next);
        return next;
      });
      setPendingTurnCount((n) => n + 1);
      queueRef.current.push({
        userMsgId: userMsg.id,
        content: content.trim(),
        focus,
        releasedClusterIds: options?.releasedClusterIds,
        primaryAvatarId: options?.primaryAvatarId,
      });
      drainChainRef.current = drainChainRef.current.then(async () => {
        while (queueRef.current.length > 0) {
          const job = queueRef.current.shift()!;
          setProcessingUserMessageId(job.userMsgId);
          setLiveSwitchboardTrace([]);
          try {
            await processUserTurn(
              () => situationContextRef.current,
              job,
              selectedAvatarIdsRef.current,
              (ctx) => {
                situationContextRef.current = ctx;
                setState((prev) => ({
                  ...prev,
                  situationContext: ctx,
                }));
              },
              {
                onTraceProgress: ({ trace: t, userMessageId: uid }) => {
                  setLiveSwitchboardTrace(t);
                  setWavesQueue((prev) => {
                    /** Derive from React state so prevLen stays in sync with batched updates (ref could skip appends). */
                    const prevLen = countWaveEntriesForUser(prev, uid);
                    const next = appendTraceDelta(prev, uid, t, prevLen);
                    schedulePersistWaves(next);
                    return next;
                  });
                },
                onWaveChatComplete: ({ userMessageId: uid, depth }) => {
                  setWavesQueue((prev) => {
                    const next = markWaveSettledForUserDepth(prev, uid, depth);
                    schedulePersistWaves(next);
                    return next;
                  });
                },
                onWorldviewActivity: ({
                  avatarId,
                  userMessageId: uid,
                  toolNames,
                  actions,
                  sourceEmailId,
                }) => {
                  setWavesQueue((prev) => {
                    const next = appendWorldviewEntry(prev, {
                      userMessageId: uid,
                      avatarId,
                      toolSummary: toolNames.join(", "),
                      sourceEmailId,
                      parseStatus: "ok",
                      actions,
                    });
                    schedulePersistWaves(next);
                    return next;
                  });
                },
                onToolResolutionError: ({
                  avatarId,
                  userMessageId: uid,
                  message,
                  detail,
                  sourceEmailId,
                }) => {
                  appendSessionLog("switchboard", "tool_resolution_error", {
                    level: "warn",
                    detail: `${avatarId}: ${message}${detail ? ` — ${detail}` : ""}`,
                  });
                  setWavesQueue((prev) => {
                    const next = appendToolResolutionErrorEntry(prev, {
                      userMessageId: uid,
                      avatarId,
                      message,
                      detail,
                      sourceEmailId,
                    });
                    schedulePersistWaves(next);
                    return next;
                  });
                },
                onWorldviewParseDiagnostic: ({
                  avatarId,
                  userMessageId: uid,
                  hints,
                  reason,
                  sourceEmailId,
                }) => {
                  const parseDetail = [reason, ...hints]
                    .filter(Boolean)
                    .join(" — ")
                    .slice(0, 520);
                  setWavesQueue((prev) => {
                    const next = appendWorldviewEntry(prev, {
                      userMessageId: uid,
                      avatarId,
                      toolSummary: "parse: malformed",
                      sourceEmailId,
                      parseStatus: "warn",
                      parseDetail,
                    });
                    schedulePersistWaves(next);
                    return next;
                  });
                },
                onSystemCommandStatus: ({
                  avatarId,
                  userMessageId: uid,
                  status,
                  detail,
                  sourceEmailId,
                }) => {
                  setWavesQueue((prev) => {
                    const next = appendSystemCommandEntry(prev, {
                      userMessageId: uid,
                      avatarId,
                      status,
                      detail,
                      sourceEmailId,
                    });
                    schedulePersistWaves(next);
                    return next;
                  });
                },
              }
            );
          } finally {
            setWavesQueue((prev) => {
              const next = markWavesSettledForUser(prev, job.userMsgId);
              schedulePersistWaves(next);
              return next;
            });
            setProcessingUserMessageId(null);
            setLiveSwitchboardTrace([]);
            setPendingTurnCount((n) => Math.max(0, n - 1));
          }
        }
      });
      await drainChainRef.current;
    },
    [schedulePersistWaves]
  );

  const handleClearChat = useCallback(() => {
    queueRef.current = [];
    setPendingTurnCount(0);
    setProcessingUserMessageId(null);
    setLiveSwitchboardTrace([]);
    setWavesQueue([]);
    saveWavesQueueToStorage(createEmptyWavesQueueDoc());
    appendSessionLog("switchboard", "Chat Visualizer queue cleared (clear chat)");
    setState((prev) => {
      const next = storeClearChat(prev.situationContext);
      situationContextRef.current = next;
      return { ...prev, situationContext: next };
    });
  }, []);

  const handlePatchSituationContext = useCallback(
    (patch: Partial<SituationContext>) => {
      setState((prev) => {
        const next = storePatchSituationContext(prev.situationContext, patch);
        situationContextRef.current = next;
        return { ...prev, situationContext: next };
      });
    },
    []
  );

  const toggleAvatarSelection = useCallback((id: string) => {
    setState((prev) => {
      const cat = getFullAvatarCatalog(prev.situationContext);
      const sc = resolvePrimarySlotCount(prev.situationContext, cat.length);
      let nextIds: string[];
      if (sc === 1) {
        const soleSelected =
          prev.selectedAvatarIds.length === 1 &&
          prev.selectedAvatarIds[0] === id;
        nextIds = soleSelected ? [] : [id];
      } else {
        const has = prev.selectedAvatarIds.includes(id);
        nextIds = has
          ? prev.selectedAvatarIds.filter((x) => x !== id)
          : [...prev.selectedAvatarIds, id];
      }
      const nextCtx = storePatchSituationContext(prev.situationContext, {
        executorOverrideAvatarId: undefined,
      });
      situationContextRef.current = nextCtx;
      return { ...prev, selectedAvatarIds: nextIds, situationContext: nextCtx };
    });
  }, []);

  const clearAvatarSelection = useCallback(() => {
    setState((prev) => {
      const nextCtx = storePatchSituationContext(prev.situationContext, {
        executorOverrideAvatarId: undefined,
      });
      situationContextRef.current = nextCtx;
      return { ...prev, selectedAvatarIds: [], situationContext: nextCtx };
    });
  }, []);

  const value: AppContextValue = {
    situationContext: state.situationContext,
    fullAvatarCatalog,
    avatars,
    selectedAvatarIds: state.selectedAvatarIds,
    setSelectedAvatarIds: (ids) =>
      setState((prev) => {
        const nextCtx = storePatchSituationContext(prev.situationContext, {
          executorOverrideAvatarId: undefined,
        });
        situationContextRef.current = nextCtx;
        return {
          ...prev,
          selectedAvatarIds: [...new Set(ids)],
          situationContext: nextCtx,
        };
      }),
    toggleAvatarSelection,
    clearAvatarSelection,
    messages: state.situationContext.conversationThread,
    sendMessage: handleSendMessage,
    clearChat: handleClearChat,
    patchSituationContext: handlePatchSituationContext,
    pendingTurnCount,
    processingUserMessageId,
    liveSwitchboardTrace,
    wavesQueue,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
