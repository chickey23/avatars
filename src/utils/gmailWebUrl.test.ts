import { describe, it, expect } from "vitest";
import { gmailRfc822SearchUrl, gmailThreadWebUrl } from "./gmailWebUrl";

describe("gmailThreadWebUrl", () => {
  it("builds thread deep link for default account", () => {
    expect(gmailThreadWebUrl("abc123")).toBe(
      "https://mail.google.com/mail/u/0/#all/abc123"
    );
  });

  it("encodes special characters in thread id", () => {
    expect(gmailThreadWebUrl("a b")).toContain(encodeURIComponent("a b"));
  });
});

describe("gmailRfc822SearchUrl", () => {
  it("wraps message id in rfc822msgid search", () => {
    const u = gmailRfc822SearchUrl("<foo@bar.com>");
    expect(u).toContain("rfc822msgid");
    expect(u).toContain(encodeURIComponent("rfc822msgid:<foo@bar.com>"));
  });
});
