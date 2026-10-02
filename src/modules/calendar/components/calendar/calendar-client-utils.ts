// Small pure helpers for the calendar page client: draft project presets, busy-day markers and
// the period label. Used by calendar-client.tsx and its hooks.
import type { useTranslations } from "next-intl";
import { addDays, dateRange, isoWeekNumber, localDateInZone, parseDate } from "../../date-utils";
import type { CalendarItem, CalendarView, CalendarWorkspace } from "../../types";

// New events start linked to the project they were opened from, or to the one
// project the calendar is filtered to.
export function pickProjects(projects: CalendarWorkspace["projects"], projectIds: string[]) {
  return projects
    .filter((project) => projectIds.includes(project.id))
    .map((project) => ({ ...project, archived: false }));
}

/** Days in [from, to) that have at least one scheduled item (dots in the mini month). */
export function busyDaysFor(items: CalendarItem[], range: { from: string; to: string }, timezone: string) {
  const days = new Set<string>();
  for (const item of items) {
    let start: string | null = null;
    let endExclusive: string | null = null;
    if (item.allDay && item.startDate) {
      start = item.startDate;
      endExclusive = item.endDate && item.endDate > item.startDate ? item.endDate : addDays(item.startDate, 1);
    } else if (item.startAt) {
      start = localDateInZone(new Date(item.startAt), timezone);
      // An event ending at midnight does not occupy the next day.
      const end = item.endAt ? localDateInZone(new Date(new Date(item.endAt).getTime() - 1), timezone) : start;
      endExclusive = addDays(end < start ? start : end, 1);
    }
    if (!start || !endExclusive) continue;
    const from = start > range.from ? start : range.from;
    const to = endExclusive < range.to ? endExclusive : range.to;
    for (const day of dateRange(from, to)) days.add(day);
  }
  return days;
}

/** Heading of the toolbar, e.g. "KW 40 · 28. Sept. – 4. Okt. 2026" or "Freitag, 2. Oktober 2026". */
export function periodLabel(
  view: CalendarView,
  date: string,
  range: { from: string; to: string },
  locale: string,
  t: ReturnType<typeof useTranslations<"calendar">>,
) {
  const format = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(parseDate(value));
  if (view === "month") return format(date, { month: "long", year: "numeric" });
  if (view === "day") return format(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const last = addDays(range.to, -1);
  const sameYear = range.from.slice(0, 4) === last.slice(0, 4);
  const span = `${format(range.from, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) })} – ${format(last, { day: "numeric", month: "short", year: "numeric" })}`;
  if (view === "agenda") return span;
  // Number the week by its fourth day (Thursday for Monday-start weeks), so Sunday-start weeks match too.
  return t("coreWeekLabel", { week: isoWeekNumber(addDays(range.from, Math.min(3, dateRange(range.from, range.to).length - 1))), range: span });
}
