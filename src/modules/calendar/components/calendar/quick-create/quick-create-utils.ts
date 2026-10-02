// Pure helpers for the quick-create popover: time formatting and building the event input.
// Used by quick-create-popover.tsx.
import { addDays, zonedDateTimeToUtc } from "../../../date-utils";
import type { upsertCalendarEvent } from "../../../actions";

export type QuickEventInput = Parameters<typeof upsertCalendarEvent>[0];

const MINUTES_PER_DAY = 24 * 60;

/** 750 → "12:30"; wraps past midnight so 1440 (end of day) → "00:00". */
export function minutesToTime(minutes: number) {
  const value = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

/** "12:30" → 750; null for anything that is not a valid 24-hour time. */
export function timeToMinutes(time: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

/**
 * The end date for a range starting on `day`: the same day when the end is later,
 * the next day when the range ends exactly at midnight, otherwise null (invalid).
 */
export function quickEndDate(day: string, startTime: string, endTime: string) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null) return null;
  if (end > start) return day;
  if (end === 0 && start > 0) return addDays(day, 1);
  return null;
}

function utcIso(date: string, time: string, timezone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return zonedDateTimeToUtc({ year, month, day, hour, minute }, timezone).toISOString();
}

/**
 * The same input shape the full event dialog sends for a new, timed, busy event
 * with the dialog's default reminder. Null when the time range is invalid.
 */
export function buildQuickEventInput({
  title,
  day,
  startTime,
  endTime,
  calendarId,
  timezone,
  allowConflicts = false,
}: {
  title: string;
  day: string;
  startTime: string;
  endTime: string;
  calendarId: string;
  timezone: string;
  allowConflicts?: boolean;
}): QuickEventInput | null {
  const endDate = quickEndDate(day, startTime, endTime);
  if (!endDate) return null;
  return {
    calendarId,
    kind: "event",
    title: title.trim(),
    description: "",
    location: "",
    address: "",
    allDay: false,
    startDate: null,
    endDate: null,
    startAt: utcIso(day, startTime, timezone),
    endAt: utcIso(endDate, endTime, timezone),
    timezone,
    availability: "busy",
    recurrenceRule: null,
    linkedTaskId: null,
    attendeeIds: [],
    reminderMinutes: [15],
    expectedUpdatedAt: null,
    allowConflicts,
  };
}

/** "Fr., 2. Okt." / "Fri, Oct 2" for a YYYY-MM-DD day, independent of the browser zone. */
export function formatQuickDay(day: string, locale: string) {
  const [year, month, date] = day.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, date, 12)));
}
