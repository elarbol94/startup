// Pure calendar-date, zoom and project-risk helpers for the portfolio Gantt timeline.
// Used by portfolio-client.tsx and the pieces in components/portfolio/.
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import { projectScheduleRisk } from "@/modules/projects/schedule";
import { localDateValue } from "@/modules/tasks/deadline-utils";
import { DAY_MS } from "./portfolio-constants";
import type { Zoom } from "./portfolio-types";

/** Gantt bar colours: project bars use the project colour at full strength;
 * task bars inherit the same colour, slightly dimmed. */
export function ganttBarColors(kind: "project" | "task", color: string) {
  if (kind === "project") {
    return {
      border: color,
      background: `color-mix(in oklab, ${color} 32%, var(--card))`,
      progress: color,
    };
  }
  return {
    border: `color-mix(in oklab, ${color} 65%, var(--card))`,
    background: `color-mix(in oklab, ${color} 14%, var(--card))`,
    progress: `color-mix(in oklab, ${color} 60%, var(--card))`,
  };
}

export function zoomModeForDayWidth(dayWidth: number): Zoom {
  if (dayWidth >= 24) return "week";
  if (dayWidth >= 11) return "month";
  return "quarter";
}

export function parseDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(value: string, days: number) {
  return isoDate(new Date(parseDate(value).getTime() + days * DAY_MS));
}

export function calendarDistance(start: string, end: string) {
  return Math.round((parseDate(end).getTime() - parseDate(start).getTime()) / DAY_MS);
}

export function calendarWeek(date: Date) {
  const weekDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = weekDate.getUTCDay() || 7;
  weekDate.setUTCDate(weekDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(weekDate.getUTCFullYear(), 0, 1));
  return Math.ceil(((weekDate.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7);
}

export function minDate(values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort()[0] ?? null;
}

export function maxDate(values: Array<string | null | undefined>) {
  const sorted = values.filter((value): value is string => Boolean(value)).sort();
  return sorted.at(-1) ?? null;
}

export function projectRisk(
  project: PortfolioSchedule["projects"][number],
  tasks: PortfolioTask[],
  today: string,
) {
  return projectScheduleRisk(project, tasks, today);
}

export function deadlineTimestampForDate(
  deadlineAt: string | null,
  deadlineDate: string,
) {
  if (!deadlineAt) return null;
  const original = new Date(deadlineAt);
  const target = localDateValue(deadlineDate);
  if (!target || Number.isNaN(original.getTime())) return null;
  target.setHours(
    original.getHours(),
    original.getMinutes(),
    original.getSeconds(),
    original.getMilliseconds(),
  );
  return target.toISOString();
}
