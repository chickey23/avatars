import { describe, it, expect } from "vitest";
import { emailBodyContentHash } from "./hash";

describe("emailBodyContentHash", () => {
  it("changes when body changes", () => {
    const a = emailBodyContentHash("hello");
    const b = emailBodyContentHash("hallo");
    expect(a).not.toBe(b);
  });

  it("is stable for same input", () => {
    const t = "same body " + "x".repeat(100);
    expect(emailBodyContentHash(t)).toBe(emailBodyContentHash(t));
  });
});
