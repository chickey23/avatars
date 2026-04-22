/**
 * Conductor for all background source runners. Ref-counted at the module scope so
 * React StrictMode's mount → unmount → mount cycle does not spawn two parallel
 * sets of runners (and their duplicate cache ticks).
 */

import {
  startEmailRunner,
  type EmailRunnerHandle,
  type StartEmailRunnerOptions,
} from "./emailRunner";
import {
  startCalendarRunner,
  type CalendarRunnerHandle,
  type StartCalendarRunnerOptions,
} from "./calendarRunner";
import {
  startContactsRunner,
  type ContactsRunnerHandle,
  type StartContactsRunnerOptions,
} from "./contactsRunner";
import { platformLog } from "../platformLog";

export type PlatformRunnerBundle = {
  email: EmailRunnerHandle;
  calendar: CalendarRunnerHandle;
  contacts: ContactsRunnerHandle;
  stopAll: () => void;
  refreshAll: () => Promise<void>;
};

export type StartPlatformRunnersOptions = {
  email?: StartEmailRunnerOptions;
  calendar?: StartCalendarRunnerOptions;
  contacts?: StartContactsRunnerOptions;
};

type InternalBundle = {
  email: EmailRunnerHandle;
  calendar: CalendarRunnerHandle;
  contacts: ContactsRunnerHandle;
};

let liveBundle: InternalBundle | null = null;
let refCount = 0;

function createBundle(options: StartPlatformRunnersOptions): InternalBundle {
  platformLog("scaffold", "runners started", { level: "info" });
  return {
    email: startEmailRunner(options.email),
    calendar: startCalendarRunner(options.calendar),
    contacts: startContactsRunner(options.contacts),
  };
}

function destroyBundle(b: InternalBundle): void {
  b.email.stop();
  b.calendar.stop();
  b.contacts.stop();
  platformLog("scaffold", "runners stopped", { level: "info" });
}

export function startPlatformRunners(
  options: StartPlatformRunnersOptions = {}
): PlatformRunnerBundle {
  if (!liveBundle) {
    liveBundle = createBundle(options);
  }
  refCount++;
  const bundle = liveBundle;

  return {
    email: bundle.email,
    calendar: bundle.calendar,
    contacts: bundle.contacts,
    stopAll: () => {
      if (refCount <= 0) return;
      refCount--;
      if (refCount === 0 && liveBundle) {
        destroyBundle(liveBundle);
        liveBundle = null;
      }
    },
    refreshAll: async () => {
      await Promise.allSettled([
        bundle.email.refreshNow(),
        bundle.calendar.refreshNow(),
        bundle.contacts.refreshNow(),
      ]);
    },
  };
}

/** Test-only reset so unit tests can start from a clean slate. */
export function __resetPlatformRunnersForTests(): void {
  if (liveBundle) {
    destroyBundle(liveBundle);
  }
  liveBundle = null;
  refCount = 0;
}

export type {
  EmailRunnerHandle,
  CalendarRunnerHandle,
  ContactsRunnerHandle,
};
