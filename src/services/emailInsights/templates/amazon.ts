import type { TemplateExtract } from "./types";

/**
 * Heuristics for Amazon shipping / order emails (English).
 */
export function extractAmazonHints(body: string, subject: string): TemplateExtract | undefined {
  const combined = `${subject}\n${body}`.toLowerCase();
  if (!combined.includes("amazon") && !/@amazon\./i.test(body) && !/amazon\.com/i.test(body)) {
    return undefined;
  }
  const invoice: TemplateExtract["invoice"] = {};
  const summaryLines: string[] = [];

  const order =
    body.match(/order\s*#?\s*(\d{3}-\d{7}-\d{7})/i) ||
    body.match(/order\s*number[:\s]+(\d{3}-\d{7}-\d{7})/i);
  if (order?.[1]) {
    invoice.orderId = order[1].trim();
    summaryLines.push(`Amazon order id ${invoice.orderId}`);
  }

  const total =
    body.match(/(?:grand\s+)?total[:\s]*(?:USD|US\$|\$)\s*([\d,]+\.\d{2})/i) ||
    body.match(/total\s*due[:\s]*(?:USD|US\$|\$)\s*([\d,]+\.\d{2})/i) ||
    body.match(/\$\s*([\d,]+\.\d{2})\s*(?:USD)?/);
  if (total?.[1]) {
    invoice.total = total[1].replace(/,/g, "");
    invoice.currency = "USD";
    summaryLines.push(`Order total $${invoice.total}`);
  }

  if (summaryLines.length === 0 && Object.keys(invoice).length === 0) {
    summaryLines.push("Amazon transactional email (heuristic).");
  }

  return { invoice: Object.keys(invoice).length ? invoice : undefined, summaryLines };
}
