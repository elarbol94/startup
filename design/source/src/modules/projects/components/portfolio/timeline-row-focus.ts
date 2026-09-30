// Pure zoom/scroll calculation that fits one row's start-to-end date range into the
// visible Gantt timeline. Used by use-timeline-layout.ts ("show timeline" row button).
import { MAX_DAY_WIDTH, MIN_DAY_WIDTH } from "./portfolio-constants";
import { calendarDistance } from "./portfolio-utils";

export function rowFocusViewport({
  rangeStart,
  startDate,
  dueDate,
  availableWidth,
}: {
  rangeStart: string;
  startDate: string | null;
  dueDate: string | null;
  availableWidth: number;
}): { dayWidth: number; scrollLeft: number } | null {
  if (!startDate || !dueDate) return null;
  const [from, to] = startDate <= dueDate ? [startDate, dueDate] : [dueDate, startDate];
  const days = calendarDistance(from, to) + 1;
  const width = Math.max(1, availableWidth);
  const dayWidth = Math.min(MAX_DAY_WIDTH, Math.max(MIN_DAY_WIDTH, width / days));
  const rangeWidth = days * dayWidth;
  // Centre short ranges (capped by MAX_DAY_WIDTH); left-align ranges wider than the view.
  const slack = Math.max(0, (width - rangeWidth) / 2);
  const scrollLeft = Math.max(0, calendarDistance(rangeStart, from) * dayWidth - slack);
  return { dayWidth, scrollLeft };
}
