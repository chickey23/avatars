import type { EmailFocusPrepResult } from "./types";

function invoiceHasValues(
  inv: EmailFocusPrepResult["invoice"]
): inv is NonNullable<EmailFocusPrepResult["invoice"]> {
  if (!inv) return false;
  return Object.values(inv).some((v) => v != null && String(v).trim() !== "");
}

/**
 * Compact lines for `relevantData` (replaces giant `Email body [id]:` for focused mail when prep ran).
 */
export function buildEmailFocusContextLines(
  messageId: string,
  prep: EmailFocusPrepResult,
  fullBodyPlain: string
): string[] {
  const out: string[] = [];
  out.push(`Email summary [${messageId}]: ${prep.summary}`);

  const keys: string[] = [];
  const inv = prep.invoice;
  if (inv?.total) {
    keys.push(
      `total=${inv.total}${inv.currency && inv.currency !== "USD" ? " " + inv.currency : ""}`
    );
  }
  if (inv?.orderId) keys.push(`orderId=${inv.orderId}`);
  if (inv?.confirmationId) keys.push(`confirmationId=${inv.confirmationId}`);
  if (inv?.routingOrReference) keys.push(`reference=${inv.routingOrReference}`);
  if (inv?.lastFour) keys.push(`lastFour=${inv.lastFour}`);
  if (prep.senderKind) keys.push(`kind=${prep.senderKind}`);

  if (keys.length) {
    out.push(`Email key fields [${messageId}]: ${keys.join("; ")}`);
  }

  const hasStructured = invoiceHasValues(prep.invoice);
  const includeExcerpt = prep.relevance === "uncertain" || !hasStructured;
  if (includeExcerpt && fullBodyPlain.trim()) {
    const ex = fullBodyPlain.replace(/\s+/g, " ").trim().slice(0, 1600);
    if (ex) {
      out.push(`Email excerpt [${messageId}]:\n${ex}`);
    }
  }

  return out;
}
