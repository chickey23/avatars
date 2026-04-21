import type { EmailInsightInvoice } from "../types";

export type TemplateExtract = {
  invoice?: EmailInsightInvoice;
  /** High-confidence lines to inject into prep / prompt */
  summaryLines?: string[];
};
