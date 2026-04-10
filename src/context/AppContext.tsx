import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useEffect,
  type ReactNode,
} from "react";
import type {
  SituationContext,
  SituationFocus,
  Avatar,
  ConversationMessage,
} from "../types";
import { appendToConversation } from "../services/situationContext";
import {
  getInitialState,
  processUserTurn,
  clearChat as storeClearChat,
  patchSituationContext as storePatchSituationContext,
  writePersistedContext,
} from "../store/appStore";
import { gatherDataFromSources } from "../connectors";
import { mergeProactiveEvaluation } from "../services/pendingNotifications";
import { ensureWorldMetadataLoaded } from "../services/worldMetadata/store";

interface AppContextValue {
  situationContext: SituationContext;
  avatars: Avatar[];
  selectedAvatarId: string;
  setSelectedAvatarId: (id: string) => void;
  messages: ConversationMessage[];
  sendMessage: (content: string, focus?: SituationFocus) => Promise<void>;
  clearChat: () => void;
  patchSituationContext: (patch: Partial<SituationContext>) => void;
  /** Number of user turns still being processed (gather + avatars). */
  pendingTurnCount: number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(getInitialState);
  const [pendingTurnCount, setPendingTurnCount] = useState(0);

  const situationContextRef = useRef(state.situationContext);
  const selectedAvatarIdRef = useRef(state.selectedAvatarId);
  const avatarsRef = useRef(state.avatars);
  const queueRef = useRef<
    { userMsgId: string; content: string; focus?: SituationFocus }[]
  >([]);
  /** Serializes drain so concurrent sends all await full processing. */
  const drainChainRef = useRef(Promise.resolve());

  useEffect(() => {
    situationContextRef.current = state.situationContext;
  }, [state.situationContext]);
  useEffect(() => {
    selectedAvatarIdRef.current = state.selectedAvatarId;
  }, [state.selectedAvatarId]);
  useEffect(() => {
    avatarsRef.current = state.avatars;
  }, [state.avatars]);

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
          const merged = mergeProactiveEvaluation(
            data,
            prev.situationContext,
            prev.avatars,
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
    async (content: string, focus?: SituationFocus) => {
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
      });
      drainChainRef.current = drainChainRef.current.then(async () => {
        while (queueRef.current.length > 0) {
          const job = queueRef.current.shift()!;
          try {
            await processUserTurn(
              () => situationContextRef.current,
              job,
              selectedAvatarIdRef.current,
              avatarsRef.current,
              (ctx) => {
                situationContextRef.current = ctx;
                setState((prev) => ({
                  ...prev,
                  situationContext: ctx,
                }));
              }
            );
          } finally {
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

  const value: AppContextValue = {
    situationContext: state.situationContext,
    avatars: state.avatars,
    selectedAvatarId: state.selectedAvatarId,
    setSelectedAvatarId: (id) => setState((prev) => ({ ...prev, selectedAvatarId: id })),
    messages: state.situationContext.conversationThread,
    sendMessage: handleSendMessage,
    clearChat: handleClearChat,
    patchSituationContext: handlePatchSituationContext,
    pendingTurnCount,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
