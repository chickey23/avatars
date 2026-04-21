import { extractAmazonHints } from "./amazon";
import { extractGenericMoneyHints } from "./generic";
import { extractRedditHints } from "./reddit";
import type { EmailInsightInvoice } from "../types";
import type { TemplateExtract } from "./types";

export type { TemplateExtract } from "./types";

/**
 * Aggregate deterministic extractions (order matters: specific senders first).
 */
export function extractTemplateHints(
  from: string,
  subject: string,
  body: string
): TemplateExtract {
  const blocks = [
    extractRedditHints(from, subject),
    extractAmazonHints(body, subject),
    extractGenericMoneyHints(body),
  ].filter(Boolean) as TemplateExtract[];

  const summaryLines = blocks.flatMap((b) => b.summaryLines ?? []);
  let invoice: EmailInsightInvoice = {};
  for (const b of blocks) {
    if (b.invoice) {
      invoice = { ...invoice, ...b.invoice };
    }
  }
  return {
    summaryLines: summaryLines.length ? summaryLines : undefined,
    invoice: Object.keys(invoice).length ? invoice : undefined,
  };
}
