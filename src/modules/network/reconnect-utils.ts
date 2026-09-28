// Keep-in-touch cadence: pure helpers shared by queries and client components (no DB imports).
import { addDays } from "@/modules/calendar/date-utils";

export const MIN_RECONNECT_DAYS = 7;
export const MAX_RECONNECT_DAYS = 730;
/** Offered in the contact form; another stored value is still shown as its own option. */
export const reconnectPresets = [30, 90, 180, 365] as const;

export type ReconnectFields = { lastContactOn: string | null; reconnectEveryDays: number | null };

/**
 * When the next conversation is due (YYYY-MM-DD), by calendar days so time
 * zones and DST never shift it. `null` means no cadence is set. A contact
 * with a cadence but no last contact yet is due right away: `""` sorts
 * before every date and is never later than today.
 */
export function reconnectDueOn(lastContactOn: string | null, everyDays: number | null) {
  if (!everyDays) return null;
  if (!lastContactOn) return "";
  return addDays(lastContactOn, everyDays);
}

/** Due on or before `today` (YYYY-MM-DD in Vienna, as elsewhere in the module). */
export function isReconnectDue(contact: ReconnectFields, today: string) {
  const dueOn = reconnectDueOn(contact.lastContactOn, contact.reconnectEveryDays);
  return dueOn !== null && dueOn <= today;
}

/**
 * Reconnect order without tie-break: never contacted first, then the earliest
 * due date; contacts without a cadence last. Independent of today.
 */
export function compareReconnectDue(a: ReconnectFields, b: ReconnectFields) {
  const dueA = reconnectDueOn(a.lastContactOn, a.reconnectEveryDays);
  const dueB = reconnectDueOn(b.lastContactOn, b.reconnectEveryDays);
  if (dueA === dueB) return 0;
  if (dueA === null) return 1;
  if (dueB === null) return -1;
  return dueA < dueB ? -1 : 1;
}
