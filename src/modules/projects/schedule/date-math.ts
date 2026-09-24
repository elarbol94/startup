// Calendar-day date arithmetic on ISO `YYYY-MM-DD` strings, plus mapping exact-date
// edits to timeline operations. Used by the schedule/ files and re-exported from ../schedule.ts.
import { ScheduleError } from "../schedule-errors";
import type { ScheduleOperation, ScheduleTask } from "./schedule-types";

const DAY_MS = 86_400_000;

export function parseIsoDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new ScheduleError("invalid", `Invalid date: ${value}`);
  return date;
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(value: string, amount: number): string {
  if (!Number.isInteger(amount)) throw new ScheduleError("invalid", "Day offset must be an integer");
  const date = parseIsoDate(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return toIsoDate(date);
}

export function calendarDaysInclusive(startDate: string, dueDate: string): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(dueDate);
  if (end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1;
}

export function dueDateForDuration(startDate: string, days: number): string {
  parseIsoDate(startDate);
  return addCalendarDays(startDate, Math.max(1, Math.round(days)) - 1);
}

export function calendarDayDistance(fromDate: string, toDate: string): number {
  const from = parseIsoDate(fromDate);
  const to = parseIsoDate(toDate);
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * Interprets an exact-date form edit as the equivalent timeline gesture.
 * Moving both edges by the same calendar-day offset is a subtree move; changing one
 * edge is a resize; all other edits author both container bounds.
 */
export function inferScheduleEditOperation(
  before: Pick<ScheduleTask, "startDate" | "dueDate">,
  after: { startDate: string; dueDate: string },
): Exclude<ScheduleOperation, "fit"> {
  if (before.startDate && before.dueDate) {
    const startDelta = calendarDayDistance(before.startDate, after.startDate);
    const dueDelta = calendarDayDistance(before.dueDate, after.dueDate);
    if (startDelta === dueDelta && startDelta !== 0) return "move";
    if (before.startDate === after.startDate) return "resize-end";
    if (before.dueDate === after.dueDate) return "resize-start";
  }
  return "place";
}
