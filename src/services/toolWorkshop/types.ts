export type ToolWorkshopAddendumCategory =
  | "permission"
  | "schema"
  | "fetch_allowlist"
  | "lexical"
  | "parse"
  | "other";

export type ToolWorkshopAddendumItem = {
  id: string;
  category: ToolWorkshopAddendumCategory;
  body: string;
  approvedAt: number;
  /** When false, excluded from prompt merge (soft-delete). */
  active: boolean;
};

export type ToolWorkshopProposalItem = {
  category: ToolWorkshopAddendumCategory;
  bodyMarkdown: string;
  affectedTools?: string[];
  evidenceIds?: string[];
};

export type ToolWorkshopProposal = {
  id: string;
  createdAt: number;
  summary: string;
  items: ToolWorkshopProposalItem[];
  /** Raw model output for debugging. */
  rawModelText?: string;
};

export type ToolWorkshopSettings = {
  maxActiveAddenda: number;
  maxAddendumItemChars: number;
  /** Hours between automatic refinement attempts (0 = interval off). */
  refinerIntervalHours: number;
  /** Run refiner when new failures since last run exceed this (0 = threshold off). */
  refinerFailureDeltaThreshold: number;
  refinerAutoEnabled: boolean;
};

export const TOOL_WORKSHOP_SCHEMA_VERSION = 1 as const;

export type ToolWorkshopDoc = {
  schemaVersion: typeof TOOL_WORKSHOP_SCHEMA_VERSION;
  settings: ToolWorkshopSettings;
  activeAddenda: ToolWorkshopAddendumItem[];
  pendingProposals: ToolWorkshopProposal[];
  /** Optional user override for refiner system prompt (full text). */
  refinerSystemOverride?: string;
  /** Last failure event count snapshot when auto-refiner produced a proposal. */
  lastRefinerFailureSnapshot?: number;
  lastAutoRefinementAt?: number;
  /** Any refiner run start (throttles interval retries). */
  lastRefinerAttemptAt?: number;
};
