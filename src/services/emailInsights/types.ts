export type EmailInsightRelevance = "relevant" | "irrelevant" | "uncertain";

/** Verbatim-ish financial / reference fields; omit unknowns. */
export type EmailInsightInvoice = {
  total?: string;
  currency?: string;
  orderId?: string;
  confirmationId?: string;
  lastFour?: string;
  routingOrReference?: string;
};

export type EmailInsightRecord = {
  messageId: string;
  contentHash: string;
  summary: string;
  relevance: EmailInsightRelevance;
  invoice?: EmailInsightInvoice;
  /** Short label e.g. receipt, newsletter, social_notification */
  senderKind?: string;
  modelId?: string;
  createdAt: number;
  lastAccessedAt: number;
};

export type EmailInsightsDoc = {
  schemaVersion: 1;
  entries: Record<string, EmailInsightRecord>;
};

export type EmailFocusPrepInput = {
  messageId: string;
  threadId?: string;
  from: string;
  subject: string;
  body: string;
  userMessage: string;
  /** Optional precomputed template extract (same shape as `extractTemplateHints`). */
  templateHints?: {
    invoice?: EmailInsightInvoice;
    summaryLines?: string[];
  };
};

export type EmailFocusPrepResult = {
  summary: string;
  relevance: EmailInsightRelevance;
  invoice?: EmailInsightInvoice;
  senderKind?: string;
  cacheHit: boolean;
  contentHash: string;
  modelId?: string;
};
