import "server-only";
import { getCalendarTimezone, listCalendarWorkspace } from "@/modules/calendar/queries";
import { addDays, localDateInZone } from "@/modules/calendar/date-utils";
import { listPresentationOverview } from "@/modules/wiki/presentation-queries";
import { listDocumentOverview } from "@/modules/wiki/research-queries";
import { listProjects } from "@/modules/projects/queries";
import type { OverviewRecord } from "./overview-data";

export function getOverviewCollections(viewer: { id: string; role?: string | null }) {
  const timezone = getCalendarTimezone(viewer.id);
  const today = localDateInZone(new Date(), timezone);
  const calendar = listCalendarWorkspace({ userId: viewer.id, from: today, to: addDays(today, 30) });
  const events = calendar.items.filter(item => item.kind === "event" || item.kind === "focus");
  const documents = listDocumentOverview();
  const presentations = listPresentationOverview(viewer);
  const projects = listProjects();
  return {
    timezone,
    counts: {
      eventsToday: events.filter(item => (item.startDate ?? (item.startAt ? localDateInZone(new Date(item.startAt), timezone) : "")) <= today && (item.allDay ? (item.endDate ?? today) > today : (item.endAt ? localDateInZone(new Date(item.endAt), timezone) : today) >= today)).length,
      documentsCount: documents.length, presentationsCount: presentations.length, projectsCount: projects.length,
    },
    calendar: events.map(item => ({
      id: item.id, title: item.title, detailsHidden: item.detailsHidden,
      href: item.detailsHidden ? null : `/calendar?view=agenda&date=${item.startDate ?? localDateInZone(new Date(item.startAt!), timezone)}`,
      date: item.startAt ? Date.parse(item.startAt) : item.startDate ? Date.parse(`${item.startDate}T12:00:00Z`) : null,
      location: item.location, today: (item.startDate ?? (item.startAt ? localDateInZone(new Date(item.startAt), timezone) : "")) <= today && (item.allDay ? (item.endDate ?? today) > today : (item.endAt ? localDateInZone(new Date(item.endAt), timezone) : today) >= today), allDay: item.allDay, dateOnly: item.allDay ? item.startDate ?? undefined : undefined,
      calendar: calendar.calendars.find(entry => entry.id === item.calendarId)?.name ?? null,
    } satisfies OverviewRecord)),
    documents: documents.map(item => ({ id: item.id, title: item.title, href: `/wiki/pages/${encodeURIComponent(item.slug)}`, date: item.updatedAt.getTime(), actor: item.updatedByName, status: item.status } satisfies OverviewRecord)),
    presentations: presentations.map(item => ({ id: item.id, title: item.title, href: `/wiki/presentations/${encodeURIComponent(item.id)}`, date: item.updatedAt.getTime(), actor: item.updatedByName } satisfies OverviewRecord)),
    projects: projects.map(item => ({ id: item.id, title: item.name, href: `/projects/${encodeURIComponent(item.id)}`, date: item.targetEndDate ? Date.parse(`${item.targetEndDate}T12:00:00Z`) : null, status: item.status, dateOnly: item.targetEndDate ?? undefined } satisfies OverviewRecord)),
  };
}
