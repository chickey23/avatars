/**
 * Data source connectors - tag-based routing and affinity matching.
 */

export * from "./types";
export * from "./mocks";

import {
  mockEmailConnector,
  mockCalendarConnector,
  mockContactsConnector,
  mockWeatherConnector,
  mockNewsConnector,
} from "./mocks";

export interface AggregatedData {
  email: Awaited<ReturnType<typeof mockEmailConnector.fetchRecent>>;
  calendar: Awaited<ReturnType<typeof mockCalendarConnector.fetchUpcoming>>;
  contacts: Awaited<ReturnType<typeof mockContactsConnector.fetchAll>>;
  weather: Awaited<ReturnType<typeof mockWeatherConnector.fetchCurrent>>;
  news: Awaited<ReturnType<typeof mockNewsConnector.fetchRecent>>;
}

/**
 * Gather data from all sources for Switchboard relevance scoring.
 * Uses real Gmail connector when enabled; else mock.
 */
export async function gatherDataFromSources(): Promise<AggregatedData> {
  const { gmailConnector, fetchCalendarUpcoming, fetchContacts } = await import("./gmail");
  const emailPromise = gmailConnector
    .fetchRecent()
    .then((e) => (e.length > 0 ? e : mockEmailConnector.fetchRecent()))
    .catch(() => mockEmailConnector.fetchRecent());
  const calendarPromise = fetchCalendarUpcoming(30)
    .then((c) => (c.length > 0 ? c : mockCalendarConnector.fetchUpcoming()))
    .catch(() => mockCalendarConnector.fetchUpcoming());
  const contactsPromise = fetchContacts(50)
    .then((c) => (c.length > 0 ? c : mockContactsConnector.fetchAll()))
    .catch(() => mockContactsConnector.fetchAll());
  const [email, calendar, contacts, weather, news] = await Promise.all([
    emailPromise,
    calendarPromise,
    contactsPromise,
    mockWeatherConnector.fetchCurrent(),
    mockNewsConnector.fetchRecent(),
  ]);
  return { email, calendar, contacts, weather, news };
}

/**
 * Convert aggregated data to relevance strings for tag matching.
 */
export function dataToRelevanceStrings(data: AggregatedData): string[] {
  return [...emailsToRelevanceStrings(data.email), ...dataToRelevanceStringsWithoutEmail(data)];
}

/** Weather and news only (email, calendar, contacts scored in `processUserTurn`). */
export function dataToRelevanceStringsWithoutEmail(data: AggregatedData): string[] {
  const out: string[] = [];
  out.push(`weather: ${data.weather.condition} ${data.weather.temp}F`);
  for (const n of data.news) {
    out.push(`news: ${n.title}`);
  }
  return out;
}

function emailsToRelevanceStrings(email: AggregatedData["email"]): string[] {
  return email.map((e) => `email: ${e.subject} ${e.snippet}`);
}
