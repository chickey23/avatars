import { createContext } from "react";
import type {
  SituationContext,
  SituationFocus,
  Avatar,
  ConversationMessage,
} from "../types";
import type { SwitchboardTraceStep } from "../types";
import type { UserTurnJob } from "../store/appStore";

export type SendMessageOptions = Pick<
  UserTurnJob,
  "releasedClusterIds" | "primaryAvatarId"
>;

export interface AppContextValue {
  situationContext: SituationContext;
  /** Merged built-in + user avatars (catalog order). */
  fullAvatarCatalog: Avatar[];
  avatars: Avatar[];
  selectedAvatarIds: string[];
  setSelectedAvatarIds: (ids: string[]) => void;
  toggleAvatarSelection: (id: string) => void;
  clearAvatarSelection: () => void;
  messages: ConversationMessage[];
  sendMessage: (
    content: string,
    focus?: SituationFocus,
    options?: SendMessageOptions
  ) => Promise<void>;
  clearChat: () => void;
  patchSituationContext: (patch: Partial<SituationContext>) => void;
  /** Number of user turns still being processed (gather + avatars). */
  pendingTurnCount: number;
  /** User message id currently processed by the switchboard queue (or null). */
  processingUserMessageId: string | null;
  /** Incremental trace while the current turn runs; cleared when the turn finishes. */
  liveSwitchboardTrace: SwitchboardTraceStep[];
}

export const AppContext = createContext<AppContextValue | null>(null);
