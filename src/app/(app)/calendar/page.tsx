import { headers } from "next/headers";
import { requireUser } from "@/lib/auth";
import { calendarViewRange } from "@/modules/calendar/calendar-period";
import { isValidDate, localDateInZone } from "@/modules/calendar/date-utils";
import { CalendarClient } from "@/modules/calendar/components/calendar-client";
import { getCalendarPageSettings } from "@/modules/calendar/page-queries";
import { listCalendarWorkspace } from "@/modules/calendar/queries";
import { calendarViews } from "@/modules/calendar/schema";
import type { CalendarView } from "@/modules/calendar/types";

const views = new Set<CalendarView>(calendarViews);

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    date?: string;
    sources?: string;
    people?: string;
    projects?: string;
    calendars?: string;
    query?: string;
    new?: string;
    project?: string;
  }>;
}) {
  const [currentUser, query, requestHeaders] = await Promise.all([
    requireUser(),
    searchParams,
    headers(),
  ]);
  // Phones get the agenda by default: a 7-column week grid is unreadable at that width.
  const isPhone =
    requestHeaders.get("sec-ch-ua-mobile") === "?1" ||
    /iPhone|iPod|Android.+Mobile|Mobi/i.test(requestHeaders.get("user-agent") ?? "");
  const settings = getCalendarPageSettings(currentUser.id);
  const view = views.has(query.view as CalendarView)
    ? (query.view as CalendarView)
    : isPhone
      ? "agenda"
      : settings.defaultView;
  // "Today" in the user's calendar timezone, so the first render already highlights it.
  const today = localDateInZone(new Date(), settings.timezone);
  const date = isValidDate(query.date ?? "") ? query.date! : today;
  const { from, to } = calendarViewRange(view, date, settings.weekStartsOn);

  const workspace = listCalendarWorkspace({
    userId: currentUser.id,
    from,
    to,
  });

  return (
    <CalendarClient
      currentUser={{ id: currentUser.id, name: currentUser.name }}
      workspace={workspace}
      view={view}
      viewWasExplicit={views.has(query.view as CalendarView)}
      date={date}
      today={today}
      range={{ from, to }}
      initialFilters={{
        sources: query.sources?.split(",").filter(Boolean) ?? [],
        people: query.people?.split(",").filter(Boolean) ?? [],
        projects: query.projects?.split(",").filter(Boolean) ?? [],
        calendars: query.calendars?.split(",").filter(Boolean) ?? [],
        query: query.query ?? "",
      }}
      openNewEvent={query.new === "event"}
      presetProjectId={query.new === "event" ? query.project ?? null : null}
    />
  );
}
