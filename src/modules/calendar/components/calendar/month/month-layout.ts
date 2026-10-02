// Pure layout logic for the month grid: spanning bars per week row, collapsed
// long-running spans ("Laufend"), and per-day entry capping with "+N weitere".
// Used by month-view.tsx and month-week-row.tsx.
import { addDays, daysBetween, localDateInZone } from "../../../date-utils";
import { coversDay, layoutAllDayBars, multiDayLastDay, type AllDayBar } from "../../../multi-day";
import type { CalendarItem } from "../../../types";

/** Items spanning at least this many days are background context, not lane content. */
export const LONG_SPAN_DAYS = 14;
/** Fixed number of visible entries per cell (bars + rows + chips, without "+N"). */
export const MONTH_MAX_ENTRIES = 4;
/** Bars may use at most this many lanes so single-day appointments stay visible. */
export const MONTH_MAX_BAR_LANES = 2;

type LayoutItem = Pick<
  CalendarItem,
  "id" | "kind" | "title" | "allDay" | "startDate" | "endDate" | "startAt" | "endAt"
>;

/** ISO 8601 week number of a YYYY-MM-DD date. */
export function isoWeek(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  const weekday = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - weekday);
  const yearStart = Date.UTC(value.getUTCFullYear(), 0, 1);
  return Math.ceil(((value.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** First day and exclusive end day of an item, in local calendar days. */
export function itemDaySpan(item: LayoutItem, timezone: string) {
  if (item.allDay) {
    if (!item.startDate || !item.endDate) return null;
    return { start: item.startDate, end: item.endDate };
  }
  if (!item.startAt || !item.endAt) return null;
  const start = localDateInZone(new Date(item.startAt), timezone);
  const last = multiDayLastDay(item, timezone) ?? start;
  return { start, end: addDays(last, 1) };
}

/** Projects and anything spanning two weeks or more collapse into the "Laufend" line. */
export function isBackgroundSpan(item: LayoutItem, timezone: string) {
  if (item.kind === "project") return true;
  const span = itemDaySpan(item, timezone);
  return Boolean(span && daysBetween(span.start, span.end) >= LONG_SPAN_DAYS);
}

export type MonthDayCell<T> = {
  day: string;
  /** Single-day items shown as rows, sorted (all-day first, then by start time). */
  entries: T[];
  /** Tasks rendered individually (only when there is room). */
  tasks: T[];
  /** Number of tasks folded into a compact count chip (0 = no chip). */
  taskChip: number;
  /** Hidden items on this day (behind "+N weitere"). */
  hidden: number;
};

export type MonthBar<T> = AllDayBar<T> & { continuesBefore: boolean; continuesAfter: boolean };

export type MonthWeekLayout<T> = {
  days: string[];
  bars: MonthBar<T>[];
  lanes: number;
  ongoing: T[];
  cells: MonthDayCell<T>[];
};

function sortEntries<T extends LayoutItem>(items: T[]) {
  return [...items].sort(
    (a, b) =>
      Number(!a.allDay) - Number(!b.allDay) ||
      (a.startAt ?? "").localeCompare(b.startAt ?? "") ||
      a.title.localeCompare(b.title),
  );
}

/** Lays out one week row (7 days) of the month grid. */
export function layoutMonthWeek<T extends LayoutItem>(
  items: T[],
  days: string[],
  timezone: string,
  { expanded = false, maxEntries = MONTH_MAX_ENTRIES, maxLanes = MONTH_MAX_BAR_LANES } = {},
): MonthWeekLayout<T> {
  const weekEnd = addDays(days[days.length - 1], 1);
  const spanning: { item: T; start: string; end: string }[] = [];
  const ongoing: T[] = [];
  const single: T[] = [];
  for (const item of items) {
    const span = itemDaySpan(item, timezone);
    if (!span || span.end <= days[0] || span.start >= weekEnd) continue;
    if (!days.some((day) => coversDay(item, day, timezone))) continue;
    // Tasks never take bar lanes, even when they span days: they fold into the per-day task chip.
    if (item.kind === "task" || daysBetween(span.start, span.end) <= 1) single.push(item);
    else if (!expanded && isBackgroundSpan(item, timezone)) ongoing.push(item);
    else spanning.push({ item, ...span });
  }
  // Timed multi-day items are laid out like all-day spans over their local days.
  const bars = layoutAllDayBars(
    spanning.map(({ item, start, end }) => ({ ...item, allDay: true, startDate: start, endDate: end, source: item })),
    days,
  ).map((bar) => ({
    ...bar,
    item: bar.item.source,
    continuesBefore: bar.item.startDate < days[0],
    continuesAfter: bar.item.endDate > weekEnd,
  }));
  const lanes = bars.reduce((count, bar) => Math.max(count, bar.lane + 1), 0);
  const visibleLanes = expanded ? lanes : Math.min(lanes, maxLanes);
  const cells = days.map((day, column) => {
    const covering = single.filter((item) => coversDay(item, day, timezone));
    const tasks = sortEntries(covering.filter((item) => item.kind === "task"));
    const entries = sortEntries(covering.filter((item) => item.kind !== "task"));
    const hiddenBars = bars.filter(
      (bar) => bar.lane >= visibleLanes && bar.startColumn <= column && bar.endColumn > column,
    ).length;
    return fitCell(day, entries, tasks, hiddenBars, expanded ? Infinity : maxEntries - visibleLanes);
  });
  return {
    days,
    bars: bars.filter((bar) => bar.lane < visibleLanes),
    lanes: visibleLanes,
    ongoing: [...ongoing].sort((a, b) => a.title.localeCompare(b.title)),
    cells,
  };
}

/** Decides what fits into a cell's remaining slots; overflow goes behind "+N weitere". */
export function fitCell<T>(day: string, entries: T[], tasks: T[], hiddenBars: number, slots: number): MonthDayCell<T> {
  if (hiddenBars === 0 && entries.length + tasks.length <= slots) {
    return { day, entries, tasks, taskChip: 0, hidden: 0 };
  }
  const chipSlots = tasks.length > 0 ? 1 : 0;
  if (hiddenBars === 0 && entries.length + chipSlots <= slots) {
    return { day, entries, tasks: [], taskChip: tasks.length, hidden: 0 };
  }
  // One slot is reserved for the "+N weitere" button.
  const capacity = Math.max(0, slots - 1);
  const shown = entries.slice(0, capacity);
  const chip = tasks.length > 0 && shown.length < capacity;
  return {
    day,
    entries: shown,
    tasks: [],
    taskChip: chip ? tasks.length : 0,
    hidden: hiddenBars + entries.length - shown.length + (chip ? 0 : tasks.length),
  };
}

/** Splits the month's days into week rows of seven. */
export function weekRows(days: string[]) {
  const rows: string[][] = [];
  for (let index = 0; index < days.length; index += 7) rows.push(days.slice(index, index + 7));
  return rows;
}
