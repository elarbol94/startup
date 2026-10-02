// Calendar page setup: the user's timezone, week start and default view, needed to compute the
// visible date range before the workspace is loaded. Used by app/(app)/calendar/page.tsx.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { getCalendarTimezone } from "./queries";
import { calendarPreferences } from "./schema";
import type { CalendarView } from "./types";

export function getCalendarPageSettings(userId: string) {
  // getCalendarTimezone also makes sure the preferences row exists.
  const timezone = getCalendarTimezone(userId);
  const row = db
    .select({
      weekStartsOn: calendarPreferences.weekStartsOn,
      defaultView: calendarPreferences.defaultView,
    })
    .from(calendarPreferences)
    .where(eq(calendarPreferences.userId, userId))
    .get();
  return {
    timezone,
    weekStartsOn: row?.weekStartsOn ?? 1,
    defaultView: (row?.defaultView ?? "week") as CalendarView,
  };
}
