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
  AvatarCreationWorkshopIntent,
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
import {
  gatherDataFromCacheFirst,
  startPlatformRunners,
  startPlatformScheduler,
  subscribePlatformEvents,
  ensurePlatformStoreLoadedAsync,
  migrateProjectsFromWorldMetadata,
  syncWorldMetadataProjectsAdditive,
  prunePlatformPlaceholderProjects,
} from "../services/platform";
import {
  getWorldMetadata,
  pruneWorldMetadataPlaceholderProjects,
  seedProjectsIntoWorldMetadata,
} from "../services/worldMetadata/store";
import { PROJECT_SEED_LIST } from "../data/projectSeedList";
import { resolveContextEntryBudgets } from "../utils/contextEntryBudget";
import {
  addPendingNotifications,
  mergeProactiveEvaluation,
} from "../services/pendingNotifications";
import { ensureWorldMetadataLoaded } from "../services/worldMetadata/store";
import { resolvePrimarySlotCount } from "../store/primaryRoster";
import { getFullAvatarCatalog } from "../store/avatarCatalog";
import { getSortedCoreAvatars } from "../services/avatarRoster";
import {
  filterOutSystemAvatars,
  setRoutingCatalogRef,
} from "../services/platform";
import {
  WAVES_QUEUE_SCHEMA_VERSION,
  appendMonitorPromptEntry,
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
import {
  runMonitorsAndPost,
  setSyntheticPostSink,
} from "../services/monitors";
import { subscribePlatformStore } from "../services/platform";
import { installDefaultMonitors } from "../services/monitors/bootstrap";
import {
  mountPlatformAudioBridge,
  resumeAudioContext,
  syncSoundscape,
  enqueueVoiceSnippet,
} from "../services/audio";
import { AUDIO_SNIPPET_IDS, voiceProfileIdForAvatar } from "../services/audio/cueRegistry";
import { getOllamaPresence } from "../services/ollama";
import {
  evaluateAutoRefinerTrigger,
  runToolWorkshopRefiner,
} from "../services/toolWorkshop";

export type { SendMessageOptions } from "./app-context";

export function AppProvider({ children }: { children: ReactNode }) {
  const avatarCreationWorkshopIntentHandlerRef = useRef<
    ((intent: AvatarCreationWorkshopIntent) => void) | null
  >(null);
  const registerAvatarCreationWorkshopIntentHandler = useCallback(
    (fn: ((intent: AvatarCreationWorkshopIntent) => void) | null) => {
      avatarCreationWorkshopIntentHandlerRef.current = fn;
    },
    []
  );
  const toolRefinerBusyRef = useRef(false);
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
    [
      state.situationContext.userAvatars,
      state.situationContext.builtinAvatarEdits,
    ]
  );
  const rosterScoresKey = JSON.stringify(
    state.situationContext.avatarRosterPriorityScoreById ?? {}
  );
  /**
   * Sidebar primary strip includes system avatars so the user can
   * address them directly. The switchboard / proactive path internally calls
   * `filterOutSystemAvatars` to keep them out of default scoring.
   */
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
   * Keep the routing catalog reference in sync with the merged catalog so
   * `isSystemAvatarId(id)` (single-arg, legacy) can resolve via tag lookup
   * without every caller threading the catalog through.
   */
  useEffect(() => {
    setRoutingCatalogRef(fullAvatarCatalog);
  }, [fullAvatarCatalog]);

  /**
   * Latest catalog pointer for the synthetic-post sink and monitor drivers —
   * they run outside React render and cannot close over `fullAvatarCatalog`
   * directly.
   */
  const fullCatalogRef = useRef(fullAvatarCatalog);
  useEffect(() => {
    fullCatalogRef.current = fullAvatarCatalog;
  }, [fullAvatarCatalog]);

  /**
   * Synthetic-post sink: monitor-authored `ConversationMessage`s are appended
   * to the active thread (no Ollama) and a `?`-glyph row is enqueued in the
   * waves queue so the Waves column shows a question-mark dot.
   */
  useEffect(() => {
    setSyntheticPostSink(({ message, wavesLabel, avatarId, monitorTag }) => {
      setState((prev) => {
        const next = appendToConversation(prev.situationContext, message);
        situationContextRef.current = next;
        writePersistedContext(next);
        return { ...prev, situationContext: next };
      });
      setWavesQueue((prev) => {
        const updated = appendMonitorPromptEntry(prev, {
          userMessageId: message.id,
          avatarId,
          monitorTag,
          label: wavesLabel,
        });
        schedulePersistWaves(updated);
        return updated;
      });
      appendSessionLog("monitors", "synthetic_posted", {
        level: "info",
        detail: `${monitorTag} by=${avatarId}`,
      });
    });
    return () => setSyntheticPostSink(null);
  }, [schedulePersistWaves]);

  useEffect(() => {
    const off = mountPlatformAudioBridge({
      getAvatarById: (id) => fullCatalogRef.current.find((a) => a.id === id),
    });
    return off;
  }, []);

  useEffect(() => {
    const onFirstPointer = () => {
      void resumeAudioContext().then((ok) => {
        if (ok) syncSoundscape();
      });
    };
    document.addEventListener("pointerdown", onFirstPointer, {
      passive: true,
      once: true,
    });
  }, []);

  /**
   * Install the built-in monitor set once. Monitors claim work via
   * `systemTags`; if no avatar claims a required contract the `unclaimed_contracts`
   * post will warn the user via whichever avatar still carries `system`.
   */
  useEffect(() => {
    installDefaultMonitors();
  }, []);

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
    /**
     * Platform store hydrates from disk (or localStorage fallback), then does a
     * one-shot import of any `world_metadata.projects` so existing user
     * projects get lifecycle state without manual re-entry. The first monitor
     * poll runs after hydration so monitors see the same state the user does.
     */
    void ensurePlatformStoreLoadedAsync().then(() => {
      /**
       * Startup hygiene + seeding (order matters):
       *   1. prune placeholder-title rows ("…", "...", "<title>") from both
       *      stores so the downstream sync doesn't re-import ghost projects.
       *   2. seed `PROJECT_SEED_LIST` into world_metadata idempotently
       *      (match by normalized title; deterministic `seed_<slug>` ids).
       *   3. run the one-shot world→platform-store migration (first install only).
       *   4. additive sync picks up any seed ids that arrived after the
       *      one-shot stamp was already set on an existing install.
       */
      pruneWorldMetadataPlaceholderProjects();
      prunePlatformPlaceholderProjects();
      seedProjectsIntoWorldMetadata(PROJECT_SEED_LIST);
      migrateProjectsFromWorldMetadata(getWorldMetadata().projects);
      syncWorldMetadataProjectsAdditive(getWorldMetadata().projects);
      /**
       * Startup hygiene happens in an async `.then()` after the first UI
       * render, so memoized views of `world_metadata.projects` (e.g. the
       * left-column Assign-task dropdown) may have captured stale ids that
       * just got pruned. Emit a cheap DOM event so those views can refresh.
       */
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("avatars:world-metadata-changed"));
      }
      void runMonitorsAndPost("startup", fullCatalogRef.current);
    });
  }, []);

  /**
   * Monitor triggers: any cache refresh (source_change) or any store mutation
   * (store_change) re-runs the subset of monitors that listen for them.
   * Monitor-internal dedup prevents these from flooding the thread.
   */
  useEffect(() => {
    const offBus = subscribePlatformEvents((evt) => {
      if (
        evt.type === "source_cache_updated" ||
        evt.type === "source_top_changed"
      ) {
        void runMonitorsAndPost("source_change", fullCatalogRef.current);
      }
    });
    const offStore = subscribePlatformStore(() => {
      void runMonitorsAndPost("store_change", fullCatalogRef.current);
    });
    return () => {
      offBus();
      offStore();
    };
  }, []);

  /**
   * Platform source runners fetch, cache, and diff in the background —
   * the per-turn preprocessor reads the cache (no live connector round-trip).
   * Subscribing here lets the UI surface top-K changes with platform/background
   * Wave rows once the waves queue plumbing is ready (todo `runner-email`).
   */
  useEffect(() => {
    const bundle = startPlatformRunners();
    const scheduler = startPlatformScheduler();
    const unsubscribe = subscribePlatformEvents((evt) => {
      if (evt.type === "source_top_changed") {
        appendSessionLog("chat", "platform_top_changed", {
          level: "info",
          detail: `${evt.kind} +${evt.addedIds.length} -${evt.removedIds.length}`,
        });
        return;
      }
      if (evt.type === "scheduler_fire") {
        /**
         * Scheduler fires are attributed to the *owner avatar*, never to
         * The scheduler, not a persona. We translate the fire into a pending notification
         * so the normal proactive UI path surfaces it in the sidebar / waves
         * queue with the correct avatar accent.
         */
        const notification = {
          id: `sched_${evt.itemKind}_${evt.itemId}_${evt.reason}_${evt.firedAt}`,
          avatarId: evt.ownerAvatarId,
          urgency: evt.urgency,
          topicSummary: evt.topicSummary,
          sourceRef: evt.sourceRef,
          score: evt.urgency === "high" ? 90 : evt.urgency === "medium" ? 70 : 50,
          createdAt: evt.firedAt,
          topicClusterId: `sched_${evt.itemKind}_${evt.itemId}`,
        };
        setState((prev) => {
          const next = addPendingNotifications(prev.situationContext, [
            notification,
          ]);
          situationContextRef.current = next;
          writePersistedContext(next);
          return { ...prev, situationContext: next };
        });
        return;
      }
    });
    return () => {
      unsubscribe();
      bundle.stopAll();
      scheduler.stop();
    };
  }, []);

  /** Non-blocking proactive notification refresh after connector-style data changes. */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const data = await gatherDataFromCacheFirst(
          resolveContextEntryBudgets(
            situationContextRef.current.contextEntryDepth
          )
        );
        if (cancelled) return;
        setState((prev) => {
          const cat = getFullAvatarCatalog(prev.situationContext);
          const routable = filterOutSystemAvatars(cat);
          const sc = resolvePrimarySlotCount(prev.situationContext, routable.length);
          const primaryAvatars = getSortedCoreAvatars(
            routable,
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

  /** Tool Workshop: auto refiner on interval / failure delta when enabled. */
  useEffect(() => {
    const tick = async () => {
      if (toolRefinerBusyRef.current) return;
      const decision = evaluateAutoRefinerTrigger(Date.now());
      if (!decision.run) return;
      const presence = await getOllamaPresence();
      if (presence !== "ready") return;
      toolRefinerBusyRef.current = true;
      try {
        await runToolWorkshopRefiner();
      } finally {
        toolRefinerBusyRef.current = false;
      }
    };
    const id = window.setInterval(() => {
      void tick();
    }, 60_000);
    void tick();
    return () => window.clearInterval(id);
  }, []);

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
                  const pick =
                    job.primaryAvatarId ?? selectedAvatarIdsRef.current[0] ?? null;
                  const roster = getFullAvatarCatalog(situationContextRef.current);
                  const avatarForCue = pick
                    ? roster.find((a) => a.id === pick)
                    : undefined;
                  enqueueVoiceSnippet(
                    AUDIO_SNIPPET_IDS.waveSettled,
                    voiceProfileIdForAvatar(avatarForCue),
                    {
                      anchor: "switchboard",
                      avatarId: pick ?? undefined,
                      cueId: AUDIO_SNIPPET_IDS.waveSettled,
                    }
                  );
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
                  toolId,
                  errorCode,
                  argsPreview,
                  sourceEmailId,
                }) => {
                  appendSessionLog("switchboard", "tool_resolution_error", {
                    level: "warn",
                    detail: `${avatarId}: ${message}${
                      toolId || errorCode
                        ? ` [${[toolId, errorCode].filter(Boolean).join(" · ")}]`
                        : ""
                    }${argsPreview ? ` — args ${argsPreview.slice(0, 160)}${argsPreview.length > 160 ? "…" : ""}` : ""}${detail ? ` — ${detail}` : ""}`,
                  });
                  setWavesQueue((prev) => {
                    const next = appendToolResolutionErrorEntry(prev, {
                      userMessageId: uid,
                      avatarId,
                      message,
                      detail,
                      toolId,
                      errorCode,
                      argsPreview,
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
                onAvatarCreationWorkshopIntent: (intent) => {
                  avatarCreationWorkshopIntentHandlerRef.current?.(intent);
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
    registerAvatarCreationWorkshopIntentHandler,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
