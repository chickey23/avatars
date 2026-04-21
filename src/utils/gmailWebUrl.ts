/**
 * Open focused Gmail in the default browser (thread view when threadId is known).
 */

const DEFAULT_ACCOUNT_INDEX = 0;

/**
 * Gmail web URL for a thread. `threadId` is the Gmail API `threadId` field.
 * @see https://mail.google.com/mail/u/0/#inbox/<threadId> style deep links
 */
export function gmailThreadWebUrl(
  threadId: string,
  accountIndex: number = DEFAULT_ACCOUNT_INDEX
): string {
  const tid = threadId.trim();
  const u = Math.max(0, Math.floor(accountIndex));
  return `https://mail.google.com/mail/u/${u}/#all/${encodeURIComponent(tid)}`;
}

/** Search by RFC822 Message-ID when thread id is unavailable. */
export function gmailRfc822SearchUrl(messageIdHeader: string, accountIndex = 0): string {
  const q = `rfc822msgid:${messageIdHeader.trim()}`;
  const u = Math.max(0, Math.floor(accountIndex));
  return `https://mail.google.com/mail/u/${u}/#search/${encodeURIComponent(q)}`;
}
