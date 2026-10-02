// Pure period maths for the calendar views: the date range a view loads and the anchor date of
// the previous/next period. Used by app/(app)/calendar/page.tsx and the calendar client.
import { addDays, endOfMonthWindow, isoDate, parseDate, startOfWeek } from "./date-utils";
import type { CalendarView } from "./types";

/** Date range [from, to) a calendar view loads for the given anchor date. */
export function calendarViewRange(view: CalendarView, date: string, weekStartsOn: number) {
  switch (view) {
    case "day":
      return { from: date, to: addDays(date, 1) };
    case "workweek": {
      // Monday–Friday of the (preference-defined) week that contains the date.
      const weekStart = startOfWeek(date, weekStartsOn);
      const from = addDays(weekStart, (1 - weekStartsOn + 7) % 7);
      return { from, to: addDays(from, 5) };
    }
    case "month": {
      const from = startOfWeek(endOfMonthWindow(date).start, weekStartsOn);
      return { from, to: addDays(from, 42) };
    }
    case "agenda":
      return { from: date, to: addDays(date, 30) };
    case "week":
    case "team": {
      const from = startOfWeek(date, weekStartsOn);
      return { from, to: addDays(from, 7) };
    }
  }
}

/** Anchor date of the period `direction` steps before (<0) or after (>0) the current one. */
export function shiftPeriodDate(view: CalendarView, date: string, direction: number) {
  switch (view) {
    case "day":
      return addDays(date, direction);
    case "month": {
      const current = parseDate(date);
      return isoDate(new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + direction, 1)));
    }
    case "agenda":
      return addDays(date, 30 * direction);
    case "workweek":
    case "week":
    case "team":
      return addDays(date, 7 * direction);
  }
}
