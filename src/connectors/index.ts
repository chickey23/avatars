/**
 * Data source connectors - tag-based routing and affinity matching.
 */

export * from "./types";
export * from "./mocks";

import type {
  CalendarEvent,
  Contact,
  EmailItem,
  NewsItem,
  WeatherData,
} from "./types";
import {
  LEGACY_CONTEXT_ENTRY_BUDGETS,
  type ContextEntryBudgets,
} from "../utils/contextEntryBudget";

export interface AggregatedData {
  email: EmailItem[];
  calendar: CalendarEvent[];
  contacts: Contact[];
  /** Live weather when a connector exists; otherwise null. */
  weather: WeatherData | null;
  news: NewsItem[];
  /** Factual lines for the prompt: skips, empty results, errors, unimplemented sources. */
  availabilityNotes: string[];
}

/** Controls bulk Gmail / People fetch for a gather call (e.g. user turn without focus). */
export type GatherDataOptions = {
  includeEmail?: boolean;
  includeContacts?: boolean;
};

const DEFAULT_GATHER_OPTIONS: Required<GatherDataOptions> = {
  includeEmail: true,
  includeContacts: true,
};

/**
 * Gather data from connectors for Switchboard / relevance scoring.
 * Does not substitute mock inbox, calendar, or contacts. Weather and news have no live
 * connector yet; those slots are empty with explicit availability notes.
 */
export async function gatherDataFromSources(
  budgets: ContextEntryBudgets = LEGACY_CONTEXT_ENTRY_BUDGETS,
  options?: GatherDataOptions
): Promise<AggregatedData> {
  const { includeEmail, includeContacts } = {
    ...DEFAULT_GATHER_OPTIONS,
    ...options,
  };
  const { gmailConnector, fetchCalendarUpcoming, fetchContacts } = await import("./gmail");

  const [emailRes, calendarRes, contactsRes] = await Promise.all([
    (async (): Promise<{ email: EmailItem[]; notes: string[] }> => {
      if (!includeEmail) {
        return {
          email: [],
          notes: [
            "Inbox listing: not included (no email selected in focus).",
          ],
        };
      }
      try {
        const email = await gmailConnector.fetchRecent(budgets.emailFetchLimit);
        if (email.length === 0) {
          return {
            email,
            notes: ["Inbox: no messages returned for this request."],
          };
        }
        return { email, notes: [] };
      } catch {
        return {
          email: [],
          notes: ["Inbox: could not load (connector error)."],
        };
      }
    })(),
    (async (): Promise<{ calendar: CalendarEvent[]; notes: string[] }> => {
      try {
        const calendar = await fetchCalendarUpcoming(
          budgets.calendarDays,
          budgets.calendarMaxResults
        );
        if (calendar.length === 0) {
          return {
            calendar,
            notes: [
              "Calendar: no upcoming events returned for this request.",
            ],
          };
        }
        return { calendar, notes: [] };
      } catch {
        return {
          calendar: [],
          notes: ["Calendar: could not load (connector error)."],
        };
      }
    })(),
    (async (): Promise<{ contacts: Contact[]; notes: string[] }> => {
      if (!includeContacts) {
        return {
          contacts: [],
          notes: [
            "Contacts directory: not included (no contact selected in focus).",
          ],
        };
      }
      try {
        const contacts = await fetchContacts(budgets.contactsFetchLimit);
        if (contacts.length === 0) {
          return {
            contacts,
            notes: ["Contacts: no contacts returned for this request."],
          };
        }
        return { contacts, notes: [] };
      } catch {
        return {
          contacts: [],
          notes: ["Contacts: could not load (connector error)."],
        };
      }
    })(),
  ]);

  const tailNotes = [
    "Weather: not connected (no live source in this build).",
    "News: not connected (no live source in this build).",
  ];

  const availabilityNotes = [
    ...emailRes.notes,
    ...calendarRes.notes,
    ...contactsRes.notes,
    ...tailNotes,
  ];

  return {
    email: emailRes.email,
    calendar: calendarRes.calendar,
    contacts: contactsRes.contacts,
    weather: null,
    news: [],
    availabilityNotes,
  };
}

/**
 * Convert aggregated data to relevance strings for tag matching.
 */
export function dataToRelevanceStrings(data: AggregatedData): string[] {
  return [
    ...emailsToRelevanceStrings(data.email),
    ...dataToRelevanceStringsWithoutEmail(data),
  ];
}

/** Connector status plus weather/news placeholders (email scored separately in `processUserTurn`). */
export function dataToRelevanceStringsWithoutEmail(data: AggregatedData): string[] {
  return [...data.availabilityNotes];
}

function emailsToRelevanceStrings(email: AggregatedData["email"]): string[] {
  return email.map((e) => `email: ${e.subject} ${e.snippet}`);
}
