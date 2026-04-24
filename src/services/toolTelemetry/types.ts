/** Source of a tool-related telemetry row. */
export type ToolTelemetrySource =
  | "patch"
  | "gmail_fetch"
  | "lexical"
  | "parse"
  | "intent";

export type ToolTelemetryEvent = {
  id: string;
  at: number;
  toolId: string;
  avatarId: string;
  userMessageId?: string;
  source: ToolTelemetrySource;
  ok: boolean;
  errorCode?: string;
  argsPreview?: string;
  /** Human-readable outcome for ok events (e.g. from worldviewActivity.actions summary). */
  resultPreview?: string;
  /** Policy / permission failures surface first in workshop UI. */
  isPermissionError?: boolean;
  /** Optional analysis hints (not shown to model). */
  isExecutor?: boolean;
  switchboardRoutingMode?: string;
};

export type ToolTelemetryAggregateRow = {
  toolId: string;
  avatarId: string;
  errorCode: string | null;
  successCount: number;
  failureCount: number;
  lastSuccessAt?: number;
  lastFailureAt?: number;
  /** Latest non-empty resultPreview or argsPreview in this bucket (by event time). */
  lastResultPreview?: string;
};

/** Rollup of intent-matched successes (derived from events with correctToolForIntent set). */
export type ToolIntentCorrectnessSummary = {
  correct: number;
  total: number;
};

/** Per-avatar intent rollup (same events as {@link ToolIntentCorrectnessSummary}). */
export type ToolIntentCorrectnessByAvatarRow = {
  avatarId: string;
  correct: number;
  total: number;
};

export const TOOL_TELEMETRY_SCHEMA_VERSION = 1 as const;

export type ToolTelemetryDoc = {
  schemaVersion: typeof TOOL_TELEMETRY_SCHEMA_VERSION;
  events: ToolTelemetryEvent[];
};
