import { describe, it, expect } from "vitest";
import {
  growFromLegacy,
  resolveContextEntryBudgets,
  LEGACY_CONTEXT_ENTRY_BUDGETS,
} from "./contextEntryBudget";

describe("growFromLegacy", () => {
  it("returns legacy at t=0 and max at t=1", () => {
    expect(growFromLegacy(5, 100, 0)).toBe(5);
    expect(growFromLegacy(5, 100, 1)).toBe(100);
  });

  it("is monotonic in t", () => {
    let prev = growFromLegacy(3, 200, 0);
    for (let s = 1; s <= 100; s++) {
      const next = growFromLegacy(3, 200, s / 100);
      expect(next).toBeGreaterThanOrEqual(prev);
      prev = next;
    }
  });
});

describe("resolveContextEntryBudgets", () => {
  it("matches legacy when depth is undefined or empty", () => {
    expect(resolveContextEntryBudgets(undefined)).toEqual(
      LEGACY_CONTEXT_ENTRY_BUDGETS
    );
    expect(resolveContextEntryBudgets({})).toEqual(
      LEGACY_CONTEXT_ENTRY_BUDGETS
    );
  });

  it("only adjusts email when only email depth is set", () => {
    const b = resolveContextEntryBudgets({ email: 1 });
    expect(b.emailTopK).toBeGreaterThan(LEGACY_CONTEXT_ENTRY_BUDGETS.emailTopK);
    expect(b.calendarDays).toBe(LEGACY_CONTEXT_ENTRY_BUDGETS.calendarDays);
    expect(b.contactsFetchLimit).toBe(
      LEGACY_CONTEXT_ENTRY_BUDGETS.contactsFetchLimit
    );
    expect(b.projectExtraTopK).toBe(
      LEGACY_CONTEXT_ENTRY_BUDGETS.projectExtraTopK
    );
    expect(b.internetSearchMaxResults).toBe(
      LEGACY_CONTEXT_ENTRY_BUDGETS.internetSearchMaxResults
    );
  });

  it("internet depth t=0 keeps 1 result cap", () => {
    const b = resolveContextEntryBudgets({ internet: 0 });
    expect(b.internetSearchMaxResults).toBe(1);
  });

  it("internet depth t=1 raises cap up to 20", () => {
    const b = resolveContextEntryBudgets({ internet: 1 });
    expect(b.internetSearchMaxResults).toBeGreaterThan(1);
    expect(b.internetSearchMaxResults).toBeLessThanOrEqual(20);
  });

  it("emailTopK never exceeds emailFetchLimit", () => {
    for (let s = 0; s <= 100; s++) {
      const b = resolveContextEntryBudgets({ email: s / 100 });
      expect(b.emailTopK).toBeLessThanOrEqual(b.emailFetchLimit);
    }
    for (let s = 0; s <= 100; s++) {
      const b = resolveContextEntryBudgets({
        email: s / 100,
        calendar: s / 100,
        contacts: s / 100,
        projects: s / 100,
      });
      expect(b.contactsTopK).toBeLessThanOrEqual(b.contactsFetchLimit);
      expect(b.calendarTopK).toBeLessThanOrEqual(b.calendarMaxResults);
    }
  });
});
