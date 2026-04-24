export type UnmetNeedStatus =
  | "open"
  | "in_progress"
  | "deferred"
  | "done"
  | "wontfix";

export type UnmetNeedRemediation =
  | "new_source"
  | "new_tool"
  | "prompt_only"
  | "investigate";

export type UnmetNeedItem = {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  /** Truncated user message when known. */
  userPromptExcerpt?: string;
  userMessageId?: string;
  /** World metadata project id (conceptual link only). */
  relatedProjectId?: string;
  status: UnmetNeedStatus;
  remediation: UnmetNeedRemediation;
  notes?: string;
  linkedTelemetryEventIds: string[];
};

export const UNMET_NEEDS_SCHEMA_VERSION = 1 as const;

export type UnmetNeedsDoc = {
  schemaVersion: typeof UNMET_NEEDS_SCHEMA_VERSION;
  items: UnmetNeedItem[];
};
