/**
 * Cache-first data gatherer. Replaces direct `gatherDataFromSources` calls
 * inside the user-turn hot path so per-turn latency no longer depends on
 * live connector round-trips; **Phase 1** gate: zero live connector fetches
 * in-turn).
 *
 * The `AggregatedData` return shape is preserved so downstream ranking,
 * formatting, and focus logic see no contract changes.
 */

import {
  type AggregatedData,
  type GatherDataOptions,
  gatherDataFromSources,
} from "../../connectors";
import type { ContextEntryBudgets } from "../../utils/contextEntryBudget";
import { LEGACY_CONTEXT_ENTRY_BUDGETS } from "../../utils/contextEntryBudget";
import { platformLog } from "./platformLog";
import {
  readSourceCache,
  type SourceCacheKind,
  type SourceCacheSnapshot,
} from "./sourceCache";

function stalenessNote(kind: SourceCacheKind, ageMs: number, count: number): string {
  return `${kind}: from platform cache (age=${Math.round(ageMs / 1000)}s, n=${count}).`;
}

function missingNote(kind: SourceCacheKind): string {
  return `${kind}: no cached snapshot yet — runner has not completed a tick.`;
}

function trim<T>(items: readonly T[], limit: number): T[] {
  return limit > 0 ? items.slice(0, limit) : [];
}

/**
 * Read each source from the cache. When a source is absent, fall back to a
 * single live fetch for that source only, so first-ever turns still work.
 * Availability notes include cache age so the prompt and debug surfaces
 * can show where each row came from.
 */
export async function gatherDataFromCacheFirst(
  budgets: ContextEntryBudgets = LEGACY_CONTEXT_ENTRY_BUDGETS,
  options?: GatherDataOptions
): Promise<AggregatedData> {
  const includeEmail = options?.includeEmail ?? true;
  const includeContacts = options?.includeContacts ?? true;
  const now = Date.now();

  const [emailSnap, calendarSnap, contactsSnap] = await Promise.all([
    readSourceCache("email"),
    readSourceCache("calendar"),
    readSourceCache("contacts"),
  ]);

  const missingKinds: SourceCacheKind[] = [];
  if (includeEmail && !emailSnap) missingKinds.push("email");
  if (!calendarSnap) missingKinds.push("calendar");
  if (includeContacts && !contactsSnap) missingKinds.push("contacts");

  if (missingKinds.length === 0) {
    return fromCache(
      emailSnap,
      calendarSnap,
      contactsSnap,
      budgets,
      { includeEmail, includeContacts },
      now
    );
  }

  /**
   * First-turn / cold-start fallback: do a single live fetch through the
   * existing gatherer, but still note the missing cache explicitly so the
   * runner health surface reflects reality.
   */
  platformLog(
    "cache_miss",
    `cache cold for ${missingKinds.join(",")}; falling back to live fetch`,
    { level: "info" }
  );
  const live = await gatherDataFromSources(budgets, {
    includeEmail,
    includeContacts,
  });
  return {
    ...live,
    availabilityNotes: [
      ...live.availabilityNotes,
      ...missingKinds.map(missingNote),
    ],
  };
}

function fromCache(
  emailSnap: SourceCacheSnapshot<"email"> | null,
  calendarSnap: SourceCacheSnapshot<"calendar"> | null,
  contactsSnap: SourceCacheSnapshot<"contacts"> | null,
  budgets: ContextEntryBudgets,
  { includeEmail, includeContacts }: { includeEmail: boolean; includeContacts: boolean },
  now: number
): AggregatedData {
  const email = includeEmail && emailSnap
    ? trim(emailSnap.items, budgets.emailFetchLimit)
    : [];
  const calendar = calendarSnap
    ? trim(calendarSnap.items, budgets.calendarMaxResults)
    : [];
  const contacts = includeContacts && contactsSnap
    ? trim(contactsSnap.items, budgets.contactsFetchLimit)
    : [];

  const availabilityNotes: string[] = [];
  if (!includeEmail) {
    availabilityNotes.push(
      "Inbox listing: not included (no email selected in focus)."
    );
  } else if (emailSnap) {
    availabilityNotes.push(
      stalenessNote("email", now - emailSnap.fetchedAt, email.length)
    );
    platformLog(
      "cache_hit",
      `email cache age=${Math.round((now - emailSnap.fetchedAt) / 1000)}s`,
      { level: "info" }
    );
  }
  if (calendarSnap) {
    availabilityNotes.push(
      stalenessNote("calendar", now - calendarSnap.fetchedAt, calendar.length)
    );
    platformLog(
      "cache_hit",
      `calendar cache age=${Math.round((now - calendarSnap.fetchedAt) / 1000)}s`,
      { level: "info" }
    );
  }
  if (!includeContacts) {
    availabilityNotes.push(
      "Contacts directory: not included (no contact selected in focus)."
    );
  } else if (contactsSnap) {
    availabilityNotes.push(
      stalenessNote("contacts", now - contactsSnap.fetchedAt, contacts.length)
    );
    platformLog(
      "cache_hit",
      `contacts cache age=${Math.round((now - contactsSnap.fetchedAt) / 1000)}s`,
      { level: "info" }
    );
  }
  availabilityNotes.push(
    "Weather: not connected (no live source in this build).",
    "News: not connected (no live source in this build)."
  );

  return {
    email,
    calendar,
    contacts,
    weather: null,
    news: [],
    availabilityNotes,
  };
}
