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
 * Agenda groups for the range. Empty days are skipped, except today: it is always
 * listed when it lies inside the range (with its ongoing items, if any).
 */
export function buildAgendaDays(items: CalendarItem[], days: string[], today: string, timezone: string) {
  const groups = buildAgendaGroups(items, days, timezone);
  if (groups.length === 0 || !days.includes(today) || groups.some((group) => group.day === today)) return groups;
  const ongoing = items
    .filter((item) => coversDay(item, today, timezone))
    .map((item) => ({ item, until: multiDayLastDay(item, timezone) }));
  const todayGroup: AgendaGroup<CalendarItem> = { day: today, items: [], ongoing };
  return [...groups, todayGroup].sort((a, b) => a.day.localeCompare(b.day));
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
