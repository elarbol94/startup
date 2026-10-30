// Work-source filter constants and item classification for the calendar filters.
// Used by calendar-client.tsx, calendar-filters-dialog.tsx and use-calendar-filtered-items.ts.
import type { CalendarItem } from "../../types";

export const SOURCE_TYPES = ["event", "focus", "deadline", "task", "project"] as const;

/** Shown without a `sources` filter: calendar entries only; tasks, deadlines and projects are opt-in. */
export const DEFAULT_SOURCES: readonly string[] = ["event", "focus"];

export function typeSource(item: CalendarItem) {
  if (item.kind === "milestone") return "task";
  return item.kind;
}
