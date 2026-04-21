import { describe, expect, it } from "vitest";
import type { EmailItem } from "../../connectors/types";
import {
  buildFocusSoftSignals,
  softBonusForEmail,
  softBonusForCalendar,
} from "./focusRelevance";
import type { SituationFocus } from "../../types";
import type { CalendarEvent } from "../../connectors/types";

function mail(
  id: string,
  subject: string,
  snippet: string,
  date: number
): EmailItem {
  return { id, from: "x@y.com", subject, snippet, date };
}

describe("focus soft signals", () => {
  it("gives same-day email a bonus vs focused email date", () => {
    const day = new Date("2025-06-10T12:00:00Z").getTime();
    const focus: SituationFocus = {
      email: { id: "f1", title: "Confirm", snippet: "venue arena downtown" },
    };
    const sig = buildFocusSoftSignals({
      focus,
      focusEmailRow: mail("f1", "Confirm", "see you at arena", day),
    });
    expect(sig).toBeDefined();
    const other = mail("o1", "Other", "unrelated", day);
    const b = softBonusForEmail(
      other,
      `${other.subject} ${other.snippet}`.toLowerCase(),
      sig
    );
    expect(b).toBeGreaterThan(0);
  });

  it("boosts calendar event in same time window as focused calendar", () => {
    const t0 = Date.UTC(2025, 5, 20, 18, 0, 0);
    const focusEv: CalendarEvent = {
      id: "f",
      title: "Main show",
      start: t0,
      end: t0 + 3600_000,
      location: "Grand Hall, Cityville",
    };
    const focus: SituationFocus = {
      calendar: { id: "f", title: "Main show" },
    };
    const sig = buildFocusSoftSignals({
      focus,
      focusCalendarRow: focusEv,
    });
    const nearby: CalendarEvent = {
      id: "n",
      title: "Afterparty",
      start: t0 + 2 * 3600_000,
      end: t0 + 3 * 3600_000,
      location: "Grand Hall, Cityville",
    };
    const blob = `${nearby.title} ${nearby.location ?? ""}`.toLowerCase();
    expect(softBonusForCalendar(nearby, blob, sig)).toBeGreaterThan(0);
  });
});
