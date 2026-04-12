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
import { mergeProactiveEvaluation } from "../services/pendingNotifications";
import { ensureWorldMetadataLoaded } from "../services/worldMetadata/store";
import {
  getActivePrimaryAvatarsPreferringSelected,
  resolvePrimarySlotCount,
} from "../store/primaryRoster";
import { getFullAvatarCatalog } from "../store/avatarCatalog";

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

  const fullAvatarCatalog = useMemo(
    () => getFullAvatarCatalog(state.situationContext),
    [state.situationContext.userAvatars]
  );
  const slotCount = resolvePrimarySlotCount(
    state.situationContext,
    fullAvatarCatalog.length
  );
  const selectedIdsKey = state.selectedAvatarIds.join(",");
  const avatars = useMemo(
    () =>
      getActivePrimaryAvatarsPreferringSelected(
        fullAvatarCatalog,
        slotCount,
        state.selectedAvatarIds
      ),
    [slotCount, selectedIdsKey, fullAvatarCatalog]
  );

  const situationContextRef = useRef(state.situationContext);
  const selectedAvatarIdsRef = useRef(state.selectedAvatarIds);
  const avatarsRef = useRef(avatars);
  const queueRef = useRef<UserTurnJob[]>([]);
  /** Serializes drain so concurrent sends all await full processing. */
  const drainChainRef = useRef(Promise.resolve());

  useEffect(() => {
    situationContextRef.current = state.situationContext;
  }, [state.situationContext]);
  useEffect(() => {
    selectedAvatarIdsRef.current = state.selectedAvatarIds;
  }, [state.selectedAvatarIds]);
  useEffect(() => {
    avatarsRef.current = avatars;
  }, [avatars]);

  /** Drop selections for avatars no longer in the primary roster. */
  useEffect(() => {
    const allowed = new Set(avatars.map((a) => a.id));
    setState((prev) => {
      const next = prev.selectedAvatarIds.filter((id) => allowed.has(id));
      if (next.length === prev.selectedAvatarIds.length) return prev;
      return { ...prev, selectedAvatarIds: next };
    });
  }, [avatars]);

  useEffect(() => {
    ensureWorldMetadataLoaded();
  }, []);

  /** Non-blocking proactive notification refresh after connector-style data changes. */
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const data = await gatherDataFromSources();
        if (cancelled) return;
        setState((prev) => {
          const cat = getFullAvatarCatalog(prev.situationContext);
          const sc = resolvePrimarySlotCount(prev.situationContext, cat.length);
          const primaryAvatars = getActivePrimaryAvatarsPreferringSelected(
            cat,
            sc,
            prev.selectedAvatarIds
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
              avatarsRef.current,
              (ctx) => {
                situationContextRef.current = ctx;
                setState((prev) => ({
                  ...prev,
                  situationContext: ctx,
                }));
              },
              {
                onTraceProgress: ({ trace: t }) => setLiveSwitchboardTrace(t),
              }
            );
          } finally {
            setProcessingUserMessageId(null);
            setLiveSwitchboardTrace([]);
            setPendingTurnCount((n) => Math.max(0, n - 1));
          }
        }
      });
      await drainChainRef.current;
    },
    []
  );

  const handleClearChat = useCallback(() => {
    queueRef.current = [];
    setPendingTurnCount(0);
    setProcessingUserMessageId(null);
    setLiveSwitchboardTrace([]);
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
      const has = prev.selectedAvatarIds.includes(id);
      const nextIds = has
        ? prev.selectedAvatarIds.filter((x) => x !== id)
        : [...prev.selectedAvatarIds, id];
      return { ...prev, selectedAvatarIds: nextIds };
    });
  }, []);

  const clearAvatarSelection = useCallback(() => {
    setState((prev) => ({ ...prev, selectedAvatarIds: [] }));
  }, []);

  const value: AppContextValue = {
    situationContext: state.situationContext,
    fullAvatarCatalog,
    avatars,
    selectedAvatarIds: state.selectedAvatarIds,
    setSelectedAvatarIds: (ids) =>
      setState((prev) => ({ ...prev, selectedAvatarIds: [...new Set(ids)] })),
    toggleAvatarSelection,
    clearAvatarSelection,
    messages: state.situationContext.conversationThread,
    sendMessage: handleSendMessage,
    clearChat: handleClearChat,
    patchSituationContext: handlePatchSituationContext,
    pendingTurnCount,
    processingUserMessageId,
    liveSwitchboardTrace,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
