import { describe, it, expect } from "vitest";
import { extractTemplateHints } from "./index";

describe("extractTemplateHints", () => {
  it("detects Reddit notifications from From header", () => {
    const x = extractTemplateHints(
      "noreply@redditmail.com",
      "Someone replied",
      "plain body"
    );
    expect(x.summaryLines?.length).toBeGreaterThan(0);
    expect(x.summaryLines?.[0]).toContain("Reddit");
  });

  it("extracts Amazon-style order id when present", () => {
    const body = `Your Amazon.com order of 1 item has shipped.
Order #112-1234567-1234567
Total: $12.34 USD`;
    const x = extractTemplateHints("ship-confirm@amazon.com", "Shipped", body);
    expect(x.invoice?.orderId).toMatch(/\d{3}-\d{7}-\d{7}/);
  });
});
