import { describe, expect, it } from "vitest";
import { runUserTurnPreprocessor } from "./userTurnPreprocessor";

describe("runUserTurnPreprocessor", () => {
  it("reduces caps for very short user messages", () => {
    const a = runUserTurnPreprocessor({
      userMessageContent: "ok",
      focus: {},
    });
    const b = runUserTurnPreprocessor({
      userMessageContent:
        "This is a much longer user message that should not trigger the short path.",
      focus: {},
    });
    expect(a.maxEmails).toBeLessThanOrEqual(b.maxEmails);
    expect(a.emailThreadTail).toBeLessThanOrEqual(b.emailThreadTail);
  });

  it("allows slightly higher caps when a project is focused", () => {
    const withProj = runUserTurnPreprocessor({
      userMessageContent: "long enough message text here",
      focus: { project: { id: "x", title: "P" } },
    });
    const plain = runUserTurnPreprocessor({
      userMessageContent: "long enough message text here",
      focus: {},
    });
    expect(withProj.maxEmails).toBeGreaterThanOrEqual(plain.maxEmails);
  });

  it("respects entryCaps upper bounds", () => {
    const loose = runUserTurnPreprocessor({
      userMessageContent: "long enough message text here",
      focus: {},
    });
    const capped = runUserTurnPreprocessor({
      userMessageContent: "long enough message text here",
      focus: {},
      entryCaps: { maxEmails: 2, maxCalendar: 2, maxContacts: 2 },
    });
    expect(capped.maxEmails).toBeLessThanOrEqual(2);
    expect(capped.maxCalendar).toBeLessThanOrEqual(2);
    expect(capped.maxContacts).toBeLessThanOrEqual(2);
    expect(loose.maxEmails).toBeGreaterThanOrEqual(capped.maxEmails);
  });

  it("tightens calendar and contact caps when only email is focused", () => {
    const emailOnly = runUserTurnPreprocessor({
      userMessageContent: "long enough message text here",
      focus: { email: { id: "m1", title: "Tickets" } },
    });
    const both = runUserTurnPreprocessor({
      userMessageContent: "long enough message text here",
      focus: {
        email: { id: "m1", title: "Tickets" },
        calendar: { id: "c1", title: "Show" },
      },
    });
    expect(emailOnly.maxCalendar).toBeLessThanOrEqual(both.maxCalendar);
    expect(emailOnly.maxContacts).toBeLessThanOrEqual(both.maxContacts);
    expect(emailOnly.maxEmails).toBeGreaterThanOrEqual(
      runUserTurnPreprocessor({
        userMessageContent: "long enough message text here",
        focus: {},
      }).maxEmails
    );
  });
});
