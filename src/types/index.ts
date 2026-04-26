/**
 * Core data models for the Avatar Interface System
 */

import type { AvatarPortraitPosition } from "../services/avatarPortrait";

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
export type RulesSkipReason =
  | "unavailable"
  | "no_models"
  /** Routing score below `preflightOllamaMinScore` for this turn (no LLM call). */
  | "preflight_low_score";

/** Per-tool summary for waves / UI (truncated, non-secret). */
export type WorldviewActivityAction = {
  tool: string;
  summary: string;
};

/**
 * Structured tool failure for Waves / session surfaces (non-secret args preview).
 */
export type WorldviewToolResolutionFailure = {
  tool: string;
  error: string;
  argsPreview?: string;
};

/** Payload from `avatars.workshop.open_draft` → UI opens Workshops → Creation. */
export type AvatarCreationWorkshopIntent = {
  seedText?: string;
  wikiQuery?: string;
};

/** Ephemeral UI actions after a successful Ollama turn (not persisted on SituationContext). */
export type PostTurnAvatarUi = {
  navigateAvatarCreationWorkshop?: AvatarCreationWorkshopIntent;
};

/** Result from runAvatarAgent (chat pipeline). */
export interface AvatarAgentResult {
  content: string;
  replySource: ReplySource;
  promptDebug?: OllamaPromptDebug;
  /** Short surface-safe reason when replySource is "fallback" (HTTP status, timeout, etc.). */
  replyError?: string;
  /** When replySource is `rules` because Ollama was not invoked (not fallback). */
  rulesSkipReason?: RulesSkipReason;
  /** Structured worldview tools applied from Ollama reply (Ollama path only). */
  worldviewToolSummary?: { names: string[] };
  /**
   * Richer tool activity for Chat Visualizer (names + optional per-tool summaries).
   * When set, prefer this over `worldviewToolSummary` alone.
   */
  worldviewActivity?: {
    names: string[];
    actions: WorldviewActivityAction[];
  };
  /** Lexical / execution issues for `tool_error` queue rows (short messages). */
  toolResolutionErrors?: string[];
  /** Structured failures; preferred over `toolResolutionErrors` for UI when present. */
  toolResolutionFailures?: WorldviewToolResolutionFailure[];
  /** Heuristic: model may have attempted tools but reply did not parse as avatars_tools_v1. */
  worldviewParseDiagnosis?: {
    hints: string[];
    reason: string | null;
  };
  /** Do not show this reply in chat (e.g. `AVATARS_NO_COMMENT` or preflight skip). */
  suppressUserMessage?: boolean;
  /** Set when Ollama was skipped due to low routing score vs `preflightOllamaMinScore`. */
  preflightSkip?: { score: number; threshold: number };
  /** Workshop / modals: applied via `ProcessUserTurnUiHooks`, not written to persisted context. */
  postTurnUi?: PostTurnAvatarUi;
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
  /** Transcript slice scrubbed of bad tool imitation (matches what the model saw). */
  recentTranscriptScrubbed?: string;
  fullPrompt: string;
  /** Rule block ids merged into the prompt from the AI rules library */
  ruleBlockIds?: string[];
  /** Pending proactive notifications block merged into the prompt when present */
  pendingNotificationsBlock?: string;
  /** Raw text returned by Ollama for this reply (before visible/tool split). */
  rawModelReply?: string;
  /** Tool names from a valid parsed envelope on that raw text, if any. */
  worldviewParsedToolIntentNames?: string[];
  /** Names of tools that actually executed successfully this turn. */
  worldviewExecutedToolNames?: string[];
  /** When envelope missing, heuristic parse mismatch hints. */
  worldviewParseHints?: string[];
  worldviewParseReason?: string | null;
  /** When Ollama was not called because routing score was below the turn threshold. */
  preflightSkip?: { score: number; threshold: number };
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
  /** Optional bundled or default portrait URL (user override lives on SituationContext). */
  portraitUrl?: string;
  /**
   * Piper / bundled audio voice profile id (paths like public/audio/cues/{snippet}/{id}.opus).
   * Omit to use the default profile ("default").
   */
  voiceProfileId?: string;
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
  /**
   * Ordered AI rule block ids from the global library (`AI_RULE_BLOCKS`).
   * When set, takes precedence over `ruleSetId` for prompt merging.
   */
  ruleBlockIds?: string[];
  /**
   * When true, UI must not offer the avatar builder for this avatar.
   * See docs/DISTRIBUTION.md. Omit or false = editable.
   */
  uneditable?: boolean;
  appearance?: AvatarAppearance;
  textBlocks?: AvatarTextBlocks;
  /** Keys from PERSONALITY_TRAITS (theme) for display / future prompt shaping */
  traitIds?: string[];
  /** Merged into prompts after rule-set blocks (e.g. Well of Souls / builder). */
  supplementalRules?: string;
  /**
   * When set, only these agentic tool ids may execute for this avatar (`executeWorldviewTools` / Gmail tools).
   * Omit or empty = all registered tools allowed (backward compatible).
   */
  allowedAgenticToolIds?: string[];
  /**
   * Machine-only tags that drive system behavior (routing exclusion, tool
   * ownership groups, monitor contracts). Distinct from the user-facing
   * `tags` field on `Profile` which is part of persona/taxonomy.
   *
   * Reserved prefixes:
   *   - `"system"` — excluded from automatic routing/scoring.
   *   - `"tool_owner:<group>"` — may invoke tools in that group (e.g. `drafts`).
   *   - `"monitor:<name>"` — contracted to run the named monitor.
   *
   * Omitted / empty = plain user avatar.
   */
  systemTags?: string[];
}

/** Agent - manages data processes; can be foreground (as Avatar) or background */
export interface Agent extends Profile {
  dataSourceBindings?: string[];
  taskType?: string;
  mode: "foreground" | "background";
  associatedAvatarId?: string;
}

/** Email focus prep shown on user chat rows (Gmail + local cache). */
export type EmailFocusRelevance = "relevant" | "irrelevant" | "uncertain";

export type EmailFocusArtifacts = {
  messageId: string;
  threadId?: string;
  cacheHit: boolean;
  relevance: EmailFocusRelevance;
  /** Open Gmail in browser when known. */
  openUrl?: string;
};

/** Inline button rendered on synthetic (monitor-authored) chat messages. */
export interface SyntheticChatAction {
  id: string;
  label: string;
  /** Opaque payload consumed by the monitor's registered action handler. */
  payload?: unknown;
}

/** A single message in the conversation thread */
export interface ConversationMessage {
  id: string;
  role: "user" | "avatar";
  avatarId?: string;
  content: string;
  timestamp: number;
  /** When this user turn used a focused email, set after prep (icons + Gmail link). */
  emailFocusArtifacts?: EmailFocusArtifacts;
  /** User turn: whether the thread still expects substantive replies (system / future UI). */
  responseRequirement?: "open" | "satisfied";
  /** Set for avatar replies from the chat pipeline (Avatar Interface Agent / `runAvatarAgent`) */
  replySource?: ReplySource;
  /** Ollama path: full prompt payload for inspection */
  promptDebug?: OllamaPromptDebug;
  /** When generation failed after building a prompt (fallback path). */
  replyError?: string;
  /** Template-only path: server down vs Ollama up with zero models. */
  rulesSkipReason?: RulesSkipReason;
  /**
   * True when the message was produced by a monitor (no Ollama call).
   * Renders with a tag chip and optional inline action buttons; dismissed
   * via the normal "unhelpful" affordance.
   */
  synthetic?: boolean;
  /** E.g. `"monitor:unassigned_projects"`. Displayed as a tag chip. */
  monitorTag?: string;
  /** Inline buttons offered by the monitor. */
  syntheticActions?: SyntheticChatAction[];
}

/** User-selected context item (email, calendar event, or contact) */
export interface FocusItem {
  id: string;
  title: string;
  /** Gmail inbox snippet when this focus came from the email list (prompt fallback if gather batch omits this id). */
  snippet?: string;
}

/** Focus — refines what AIs should consider (SPEC: wired into Situation Context / relevantData) */
export interface SituationFocus {
  email?: FocusItem;
  calendar?: FocusItem;
  contact?: FocusItem;
  /** World-metadata project (local id + display title). */
  project?: FocusItem;
}

/** Proactive notification urgency (SPEC § Proactive notifications) */
export type NotificationUrgency = "low" | "medium" | "high";

/** Connector / store item reference for a pending notification */
export type NotificationSourceRef =
  | { kind: "email"; id: string }
  | { kind: "calendar"; id: string }
  | { kind: "contact"; id: string }
  | { kind: "project"; id: string }
  | { kind: "task"; id: string };

/**
 * User-adjustable knobs for proactive gating and reply style; persisted on situation context.
 * Omitted fields use app defaults in `resolveBehaviorTuning`.
 */
export interface BehaviorTuning {
  proactiveMinCombinedScore?: number;
  proactiveMinAffinityBonus?: number;
  /** 0 = emphasize persona; 100 = emphasize context + literal user message */
  replyContextFocus?: number;
  /** 0 = terse / low engagement cues; 100 = fuller replies */
  userEngagementLevel?: number;
  userMoodNote?: string;
}

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

/**
 * Per–context-tab depth sliders (0–1). Omitted keys use legacy defaults for that connector.
 */
export type ContextEntryDepth = {
  email?: number;
  calendar?: number;
  contacts?: number;
  projects?: number;
  /** 0–1: caps how many web search hits are requested per run from the Context → Internet tab. */
  internet?: number;
};

/** One inbox row after context scoring (ephemeral diagnostics for Storage viz). */
export type EmailRankingDiagnosticRow = {
  emailId: string;
  subject: string;
  from: string;
  snippet: string;
  rawScore: number;
  normFocus: number;
  normScore: number;
  rank: number;
};

/** Full inbox scoring snapshot: top-K (in prompt) vs rest (evaluated, not injected). */
export type EmailRankingDiagnostics = {
  topK: number;
  inPrompt: EmailRankingDiagnosticRow[];
  belowTopK: EmailRankingDiagnosticRow[];
};

/** Situation Context - shared state for cascade and contextual awareness */
export interface SituationContext {
  conversationThread: ConversationMessage[];
  recentEvents: string[];
  activeTask?: string;
  cuesAndTriggers: string[];
  /** Data from connectors (email, calendar, etc.) for relevance */
  relevantData?: string[];
  /**
   * User-pinned lines from Context → Internet (web/wiki search). Merged into
   * `relevantData` each turn; not connector-scored. Persisted.
   */
  userInternetContextLines?: string[];
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
   * Ephemeral: Gmail message ids the model may fetch via `gmail.fetch_message_body` this turn
   * (loaded inbox snapshot for the turn, de-duplicated).
   * Not persisted.
   */
  turnEmailFetchAllowlist?: string[];
  /**
   * Ephemeral: how `distributeAndRespond` runs for this processUserTurn call.
   * Not persisted.
   */
  switchboardRoutingMode?: "cascade" | "single_wave";
  /**
   * Ephemeral: minimum `getRoutingScoreForAvatar` to call Ollama; below = synthetic no-comment without LLM.
   * Omit to disable preflight skip.
   */
  preflightOllamaMinScore?: number;
  /**
   * Ephemeral: resolved executor avatar id for this turn (structural tools / prompt tier).
   * Not persisted.
   */
  executorAvatarIdForTurn?: string;
  /**
   * Ephemeral: last inbox ranking snapshot for the most recent user turn (UI / Storage viz).
   * Not persisted.
   */
  lastEmailRankingDiagnostics?: EmailRankingDiagnostics;
  /**
   * Mirror of Context panel Focus for proactive scoring (persisted).
   */
  userFocus?: SituationFocus;
  /**
   * Depth per connector tab (0–1). Omitted keys = legacy defaults for that source.
   * Persisted.
   */
  contextEntryDepth?: ContextEntryDepth;
  /**
   * Behavior dials (proactive thresholds, context vs character, mood / engagement); persisted.
   */
  behaviorTuning?: BehaviorTuning;
  /**
   * How many avatars from the ordered primary catalog are shown and used as primaries.
   * Clamped at runtime to `min(MAX_PRIMARY_SLOTS, catalog length)`. Default when omitted: 3.
   * Persisted.
   */
  primaryAvatarSlotCount?: number;
  /**
   * Roster priority 0–100 per avatar id (ties broken by id when sorting). Cold-reset from legacy popularity.
   * Persisted.
   */
  avatarRosterPriorityScoreById?: Record<string, number>;
  /** When true, `avatarRosterPriorityScoreById` has been initialized and legacy popularity key cleared. Persisted. */
  avatarRosterScoresInitialized?: boolean;
  /**
   * UI-only: executor override (e.g. pop-in selected). Recomputed on roster selection/movement per product rules.
   * Persisted.
   */
  executorOverrideAvatarId?: string;
  /**
   * User-chosen portrait image per avatar id (typically data URLs from local file pick).
   * Persisted.
   */
  avatarPortraitSrcById?: Record<string, string>;
  /**
   * Per-avatar focal point for `object-position`, used to frame headshots.
   * Values are percentages from 0 to 100.
   */
  avatarPortraitPositionById?: Record<string, AvatarPortraitPosition>;
  /**
   * Per-avatar portrait magnification. 1 = natural cover crop; range is 0.5–2.
   * Persisted.
   */
  avatarPortraitScaleById?: Record<string, number>;
  /**
   * User-created avatars appended after built-in defaults in catalog order.
   * Persisted.
   */
  userAvatars?: Avatar[];
  /**
   * Full avatar snapshots overriding built-in defaults by id (muse, accomplice, …).
   * Persisted. Used when the user edits a default avatar in the builder.
   */
  builtinAvatarEdits?: Record<string, Avatar>;
}

/** Why the Switchboard chose responders for a wave */
export type SwitchboardSelection =
  | "forced_primary"
  | "forced_multi"
  | "tag_interest_match"
  | "semantic_match"
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
  focus?: {
    emailId?: string;
    calendarId?: string;
    contactId?: string;
    projectId?: string;
  };
  /** Gmail focus prep result for this turn (archive / routing UI). */
  emailFocusArtifacts?: EmailFocusArtifacts;
  /**
   * Legacy: first forced responder, or empty when `routingMode` is switchboard.
   * Prefer `routingMode` + `forcedResponderIds` when present.
   */
  primaryAvatarId: string;
  /** How the first wave was chosen (omitted on older archive rows). */
  routingMode?: "forced" | "switchboard";
  /** Ids passed to the first wave when forced (single or multi). */
  forcedResponderIds?: string[];
  switchboardTrace: SwitchboardTraceStep[];
  replySummary: ReplySummaryEntry[];
}
