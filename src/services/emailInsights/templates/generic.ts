import type { TemplateExtract } from "./types";

/**
 * Weak heuristics for receipts / totals when sender-specific templates miss.
 */
export function extractGenericMoneyHints(body: string): TemplateExtract | undefined {
  const invoice: TemplateExtract["invoice"] = {};
  const summaryLines: string[] = [];

  const total =
    body.match(/(?:total|amount\s+due|charged)[:\s]*(?:USD|US\$|\$)\s*([\d,]+\.\d{2})/i) ||
    body.match(/(?:USD|US\$)\s*([\d,]+\.\d{2})/);
  if (total?.[1]) {
    invoice.total = total[1].replace(/,/g, "");
    summaryLines.push(`Detected total $${invoice.total} (heuristic).`);
  }

  const conf =
    body.match(/(?:confirmation|reference|transaction)\s*(?:id|#|number)[:\s#]*([A-Za-z0-9-]{6,40})/i) ||
    body.match(/\b(?:ID|#)\s*[:#]?\s*([A-Z0-9]{8,32})\b/);
  if (conf?.[1] && !invoice.orderId) {
    invoice.confirmationId = conf[1].trim();
    summaryLines.push(`Reference / confirmation ${invoice.confirmationId}`);
  }

  if (summaryLines.length === 0) return undefined;
  return { invoice: Object.keys(invoice).length ? invoice : undefined, summaryLines };
}
