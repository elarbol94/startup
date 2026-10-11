import "server-only";
import { getCalendarTimezone, listCalendarWorkspace } from "@/modules/calendar/queries";
import { addDays, localDateInZone } from "@/modules/calendar/date-utils";
import type { OverviewRecord } from "./overview-data";

/** Calendar entries of the next 30 days for the dashboard; `today` marks those running today. */
export function getOverviewCalendar(viewer: { id: string }) {
  const timezone = getCalendarTimezone(viewer.id);
  const today = localDateInZone(new Date(), timezone);
  const calendar = listCalendarWorkspace({ userId: viewer.id, from: today, to: addDays(today, 30) });
  const events = calendar.items.filter(item => item.kind === "event" || item.kind === "focus");
  const startDay = (item: typeof events[number]) => item.startDate ?? (item.startAt ? localDateInZone(new Date(item.startAt), timezone) : "");
  const runsToday = (item: typeof events[number]) => startDay(item) <= today && (item.allDay ? (item.endDate ?? today) > today : (item.endAt ? localDateInZone(new Date(item.endAt), timezone) : today) >= today);
  return {
    timezone,
    events: events.map(item => ({
      id: item.id, title: item.title, detailsHidden: item.detailsHidden,
      href: item.detailsHidden ? null : `/calendar?view=agenda&date=${startDay(item)}`,
      date: item.startAt ? Date.parse(item.startAt) : item.startDate ? Date.parse(`${item.startDate}T12:00:00Z`) : null,
      location: item.location, today: runsToday(item), allDay: item.allDay, dateOnly: item.allDay ? item.startDate ?? undefined : undefined,
      calendar: calendar.calendars.find(entry => entry.id === item.calendarId)?.name ?? null,
    } satisfies OverviewRecord)),
  };
}
