// Pure helpers for the agenda view: day grouping, per-day ordering and labels.
import { addDays, parseDate } from "../../../date-utils";
import { buildAgendaGroups, coversDay, multiDayLastDay, type AgendaEntry, type AgendaGroup } from "../../../multi-day";
import type { CalendarItem } from "../../../types";

export type AgendaDayParts = {
  allDay: AgendaEntry<CalendarItem>[];
  timed: AgendaEntry<CalendarItem>[];
  tasks: AgendaEntry<CalendarItem>[];
};

/**
 * Agenda groups for the range. Empty days are skipped, except today (it is always listed
 * when it lies inside the range, with its ongoing items, if any) and the first `padDays`
 * days of the range, which phones show as a week-like day list ("Keine Termine").
 */
export function buildAgendaDays(items: CalendarItem[], days: string[], today: string, timezone: string, padDays = 0) {
  const groups = buildAgendaGroups(items, days, timezone);
  const listed = new Set(groups.map((group) => group.day));
  const extra = [...days.slice(0, padDays), ...(days.includes(today) ? [today] : [])].filter((day, index, all) => !listed.has(day) && all.indexOf(day) === index);
  if (groups.length === 0 && padDays === 0) return groups;
  const padded = extra.map((day): AgendaGroup<CalendarItem> => ({
    day,
    items: [],
    ongoing: items.filter((item) => coversDay(item, day, timezone)).map((item) => ({ item, until: multiDayLastDay(item, timezone) })),
  }));
  return [...groups, ...padded].sort((a, b) => a.day.localeCompare(b.day));
}

/** Saturday or Sunday (ISO date string). */
export function isWeekend(day: string) {
  const weekday = parseDate(day).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** Short weekday and day number for the phone day list's date column. */
export function formatDayColumn(day: string, locale: string) {
  const date = parseDate(day);
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date).replace(/\.$/, ""),
    day: date.getUTCDate(),
  };
}

/** All-day entries first, then timed entries by start time; tasks go into their own group. */
export function splitAgendaDay(entries: AgendaEntry<CalendarItem>[]): AgendaDayParts {
  const parts: AgendaDayParts = { allDay: [], timed: [], tasks: [] };
  for (const entry of entries) {
    if (entry.item.kind === "task") parts.tasks.push(entry);
    else if (entry.item.allDay || !entry.item.startAt) parts.allDay.push(entry);
    else parts.timed.push(entry);
  }
  parts.timed.sort(
    (a, b) =>
      a.item.startAt!.localeCompare(b.item.startAt!) ||
      (a.item.endAt ?? "").localeCompare(b.item.endAt ?? "") ||
      a.item.title.localeCompare(b.item.title),
  );
  return parts;
}

/** Index of the first timed entry that has not started yet (where the "now" divider goes). */
export function nowDividerIndex(timed: AgendaEntry<CalendarItem>[], now: number) {
  const index = timed.findIndex(({ item }) => new Date(item.startAt!).getTime() > now);
  return index < 0 ? timed.length : index;
}

export function hasEnded(item: CalendarItem, now: number | null) {
  return now !== null && !item.allDay && Boolean(item.endAt) && new Date(item.endAt!).getTime() <= now;
}

export type DayRelation = "today" | "tomorrow" | null;

export function dayRelation(day: string, today: string): DayRelation {
  if (day === today) return "today";
  if (day === addDays(today, 1)) return "tomorrow";
  return null;
}

export function formatDayHeading(day: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parseDate(day));
}

export function formatShortDate(day: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(parseDate(day));
}

export function formatTime(value: string, locale: string, timezone: string) {
  return new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone: timezone }).format(new Date(value));
}
