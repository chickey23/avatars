import type { SituationFocus } from "../../types";
import {
  EMAIL_CONTEXT_TOP_K,
  EMAIL_THREAD_TAIL_DEFAULT,
} from "../contextScoring/email";
import {
  CALENDAR_CONTEXT_TOP_K,
  CALENDAR_THREAD_TAIL_DEFAULT,
} from "../contextScoring/calendar";
import {
  CONTACT_CONTEXT_TOP_K,
  CONTACT_THREAD_TAIL_DEFAULT,
} from "../contextScoring/contacts";

export type UserTurnPreprocessorResult = {
  maxEmails: number;
  maxCalendar: number;
  maxContacts: number;
  emailThreadTail: number;
  calendarThreadTail: number;
  contactThreadTail: number;
};

const SHORT_USER_MSG_LEN = 24;

/**
 * Deterministic caps / thread-tail sizes before heavy context scoring (v1).
 * No LLM call.
 */
export function runUserTurnPreprocessor(args: {
  userMessageContent: string;
  focus?: SituationFocus;
  /** Upper bounds from context-entry slider; preprocessor may still shrink (short msg, etc.). */
  entryCaps?: { maxEmails: number; maxCalendar: number; maxContacts: number };
}): UserTurnPreprocessorResult {
  const u = args.userMessageContent.trim();
  const short = u.length > 0 && u.length < SHORT_USER_MSG_LEN;
  const projectFocus = Boolean(args.focus?.project?.id);
  const emailCentric =
    Boolean(args.focus?.email?.id) && !args.focus?.calendar?.id;

  let maxEmails = EMAIL_CONTEXT_TOP_K;
  let maxCalendar = CALENDAR_CONTEXT_TOP_K;
  let maxContacts = CONTACT_CONTEXT_TOP_K;
  let emailThreadTail = EMAIL_THREAD_TAIL_DEFAULT;
  let calendarThreadTail = CALENDAR_THREAD_TAIL_DEFAULT;
  let contactThreadTail = CONTACT_THREAD_TAIL_DEFAULT;

  if (short) {
    maxEmails = Math.min(3, maxEmails);
    maxCalendar = Math.min(3, maxCalendar);
    maxContacts = Math.min(3, maxContacts);
    emailThreadTail = Math.min(10, emailThreadTail);
    calendarThreadTail = Math.min(10, calendarThreadTail);
    contactThreadTail = Math.min(10, contactThreadTail);
  }

  if (projectFocus) {
    maxEmails = Math.min(maxEmails + 1, 8);
    maxCalendar = Math.min(maxCalendar + 1, 8);
  }

  /** Email focus without calendar: prioritize inbox lines; trim calendar/contact K. */
  if (emailCentric) {
    maxEmails = Math.min(maxEmails + 1, 8);
    maxCalendar = Math.min(maxCalendar, 3);
    maxContacts = Math.min(maxContacts, 3);
  }

  const caps = args.entryCaps;
  if (caps) {
    maxEmails = Math.min(maxEmails, caps.maxEmails);
    maxCalendar = Math.min(maxCalendar, caps.maxCalendar);
    maxContacts = Math.min(maxContacts, caps.maxContacts);
  }

  return {
    maxEmails,
    maxCalendar,
    maxContacts,
    emailThreadTail,
    calendarThreadTail,
    contactThreadTail,
  };
}
