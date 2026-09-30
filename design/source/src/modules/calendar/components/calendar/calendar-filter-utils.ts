// Work-source filter constants and item classification for the calendar filters.
// Used by calendar-client.tsx, calendar-filters-dialog.tsx and use-calendar-filtered-items.ts.
import type { CalendarItem } from "../../types";

export const SOURCE_TYPES = ["event", "focus", "deadline", "task", "project"] as const;

export function typeSource(item: CalendarItem) {
  if (item.kind === "milestone") return "task";
  return item.kind;
}
