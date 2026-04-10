/**
 * Core data models for the Avatar Interface System
 */

/** Shared base for Avatars and Agents */
export interface Profile {
  id: string;
  processName: string;
  givenName: string;
  appellation: string;
  description: string;
  tags: string[];
}

/** Opinion value: influences cascade participation and tone */
export type OpinionValue = "trust" | "doubt" | "neutral" | "affinity" | "challenge";

/** How the last reply was produced (for styling and prompt inspection). */
export type ReplySource =
  | "ollama"
  /** Template engine only; Ollama not used (unavailable or no models). */
  | "rules"
  /** Ollama was available and a prompt was built, but generation failed; body is template fallback. */
  | "fallback"
  | "other";

/** Why the template-only path ran when Ollama was not used for generation. */
export type RulesSkipReason = "unavailable" | "no_models";

/** Result from runAvatarAgent (chat pipeline). */
export interface AvatarAgentResult {
  content: string;
  replySource: ReplySource;
  promptDebug?: OllamaPromptDebug;
  /** Short surface-safe reason when replySource is "fallback" (HTTP status, timeout, etc.). */
  replyError?: string;
  /** When replySource is `rules` because Ollama was not invoked (not fallback). */
  rulesSkipReason?: RulesSkipReason;
}

/** Debug payload shown in the expandable prompt panel (Ollama path). */
export interface OllamaPromptDebug {
  givenName: string;
  personality: string;
  interests: string[];
  tasks: { title: string }[];
  activeTask?: string;
  relevantData: string[];
  recentTranscript: string;
  fullPrompt: string;
  /** Rule block ids merged into the prompt from the AI rules library */
  ruleBlockIds?: string[];
  /** Pending proactive notifications block merged into the prompt when present */
  pendingNotificationsBlock?: string;
}

/** Reusable snippet in the global AI rules library */
export interface AiRuleBlock {
  id: string;
  title: string;
  body: string;
}

/** Named bundle of rule block ids (per avatar or shared). */
export interface AiRuleSet {
  id: string;
  name: string;
  blockIds: string[];
}

/** Visual customization (Phase 4; optional on each avatar). */
export interface AvatarAppearance {
  /** CSS color string, e.g. #7dd3fc */
  accentColor?: string;
  /** Key from CHAT_WINDOW_STYLE_IDS in theme */
  chatSkinId?: string;
}

/** Optional fixed text merged into prompts or UI. */
export interface AvatarTextBlocks {
  preamble?: string;
  signOff?: string;
}

/** Avatar - user-facing interface layer with personality */
export interface Avatar extends Profile {
  personality: string;
  interests: string[];
  assignedTasks: string[];
  /** Map of avatarId -> OpinionValue. Mutable over time based on interactions. */
  opinions: Record<string, OpinionValue>;
  /** Links to AiRuleSet.id in the rules library */
  ruleSetId?: string;
  appearance?: AvatarAppearance;
  textBlocks?: AvatarTextBlocks;
  /** Keys from PERSONALITY_TRAITS (theme) for display / future prompt shaping */
  traitIds?: string[];
}

/** Agent - manages data processes; can be foreground (as Avatar) or background */
export interface Agent extends Profile {
  dataSourceBindings?: string[];
  taskType?: string;
  mode: "foreground" | "background";
  associatedAvatarId?: string;
}

/** A single message in the conversation thread */
export interface ConversationMessage {
  id: string;
  role: "user" | "avatar";
  avatarId?: string;
  content: string;
  timestamp: number;
  /** Set for avatar replies from the chat pipeline (Avatar Interface Agent / `runAvatarAgent`) */
  replySource?: ReplySource;
  /** Ollama path: full prompt payload for inspection */
  promptDebug?: OllamaPromptDebug;
  /** When generation failed after building a prompt (fallback path). */
  replyError?: string;
  /** Template-only path: server down vs Ollama up with zero models. */
  rulesSkipReason?: RulesSkipReason;
}

/** User-selected context item (email, calendar event, or contact) */
export interface FocusItem {
  id: string;
  title: string;
}

/** Focus — refines what AIs should consider (SPEC: wired into Situation Context / relevantData) */
export interface SituationFocus {
  email?: FocusItem;
  calendar?: FocusItem;
  contact?: FocusItem;
}

/** Proactive notification urgency (SPEC § Proactive notifications) */
export type NotificationUrgency = "low" | "medium" | "high";

/** Connector item reference for a pending notification */
export type NotificationSourceRef =
  | { kind: "email"; id: string }
  | { kind: "calendar"; id: string }
  | { kind: "contact"; id: string };

/** One Avatar’s pending reaction offer for a shared topic cluster */
export interface PendingNotification {
  id: string;
  avatarId: string;
  urgency: NotificationUrgency;
  /** One-line gist for UI and release matching */
  topicSummary: string;
  sourceRef: NotificationSourceRef;
  /** Raw score for ordering batches (proactive path, not user-turn relevantData) */
  score: number;
  createdAt: number;
  /** Same id for all Avatars reacting to the same underlying event */
  topicClusterId: string;
}

/** Situation Context - shared state for cascade and contextual awareness */
export interface SituationContext {
  conversationThread: ConversationMessage[];
  recentEvents: string[];
  activeTask?: string;
  cuesAndTriggers: string[];
  /** Data from connectors (email, calendar, etc.) for relevance */
  relevantData?: string[];
  /** Last Well of Souls generator output; optional merge into `relevantData` when `useWellOfSoulsInChat` is true. */
  wellOfSoulsRules?: string;
  /** When true, `sendMessage` prepends `wellOfSoulsRules` into relevance for the avatar pipeline. */
  useWellOfSoulsInChat?: boolean;
  /**
   * Proactive offers (SPEC § Proactive notifications). Revisable; persisted unless stripped by implementation.
   */
  pendingNotifications?: PendingNotification[];
  /**
   * Fingerprint of last connector snapshot used for delta detection (e.g. hash of ids).
   * Persisted.
   */
  lastConnectorSnapshotKey?: string;
  /**
   * Email ids already evaluated for proactive pending notifications (capped list).
   * Persisted.
   */
  proactiveProcessedEmailIds?: string[];
  /**
   * Ephemeral: while a queued user turn is being processed, which user message this wave answers.
   * Lets prompts include the full thread (later user lines) while routing targets this message.
   * Not persisted.
   */
  replyToUserMessageId?: string;
  /**
   * Ephemeral: topic cluster ids whose pending items are “released” for this user turn (user text addressed the topic).
   * Not persisted.
   */
  pendingReleaseClusterIds?: string[];
  /**
   * Mirror of Context panel Focus for proactive scoring (persisted).
   */
  userFocus?: SituationFocus;
}

/** Why the Switchboard chose responders for a wave */
export type SwitchboardSelection =
  | "forced_primary"
  | "tag_interest_match"
  | "default_primary"
  | "cascade";

/** One wave in the cascade (for logging / archive) */
export interface SwitchboardTraceStep {
  depth: number;
  responderIds: string[];
  selection: SwitchboardSelection;
}

/** Minimal per-avatar reply summary in archive */
export interface ReplySummaryEntry {
  avatarId: string;
  preview?: string;
}

/** Tri-state chat column: messages only, + inline routing, + expanded per-turn log */
export type ChatViewMode = "chat" | "chat_routing" | "routing_log";

/** Append-only compact record per user turn (see SPEC: Conversation archive) */
export interface CompactTurnRecord {
  id: string;
  ts: number;
  /** Links to `ConversationMessage.id` for inline routing UI */
  userMessageId: string;
  userPreview: string;
  focus?: { emailId?: string; calendarId?: string; contactId?: string };
  primaryAvatarId: string;
  switchboardTrace: SwitchboardTraceStep[];
  replySummary: ReplySummaryEntry[];
}
