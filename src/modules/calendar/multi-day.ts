import { addDays, daysBetween, localDateInZone } from "./date-utils";
import { timedDaySegment } from "./event-time";

type SpanItem = {
  id: string;
  kind: string;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startAt: string | null;
  endAt: string | null;
};

/** Whether the item is visible on the given calendar day (same rules as the views). */
export function coversDay(item: SpanItem, day: string, timezone: string) {
  return item.allDay
    ? Boolean(item.startDate && item.endDate && item.startDate <= day && item.endDate > day)
    : Boolean(timedDaySegment(item.startAt, item.endAt, day, timezone));
}

/** Last calendar day (inclusive) of an item that spans more than one day, otherwise null. */
export function multiDayLastDay(item: SpanItem, timezone: string) {
  if (item.allDay) {
    if (!item.startDate || !item.endDate) return null;
    return daysBetween(item.startDate, item.endDate) > 1 ? addDays(item.endDate, -1) : null;
  }
  if (!item.startAt || !item.endAt) return null;
  const startDay = localDateInZone(new Date(item.startAt), timezone);
  const lastDay = localDateInZone(new Date(new Date(item.endAt).getTime() - 1), timezone);
  return lastDay > startDay ? lastDay : null;
}

export type AgendaEntry<T> = { item: T; until: string | null };
export type AgendaGroup<T> = { day: string; items: AgendaEntry<T>[]; ongoing: AgendaEntry<T>[] };

/** First calendar day of an item (local day for timed items). */
function firstDay(item: SpanItem, timezone: string) {
  if (item.allDay) return item.startDate;
  return item.startAt ? localDateInZone(new Date(item.startAt), timezone) : null;
}

/**
 * Groups items per agenda day. A multi-day item that starts inside the range is listed once,
 * on its start day (with its last day as `until`); on later days it only appears in the
 * collapsed `ongoing` list. Items already running before the range go straight to `ongoing`.
 * Days that would only repeat already known ongoing items are omitted.
 */
export function buildAgendaGroups<T extends SpanItem>(items: T[], days: string[], timezone: string) {
  const lastDays = new Map(items.map((item) => [item.id, multiDayLastDay(item, timezone)]));
  const shown = new Set<string>();
  const groups: AgendaGroup<T>[] = [];
  for (const day of days) {
    const single: AgendaEntry<T>[] = [];
    const starting: AgendaEntry<T>[] = [];
    const ongoing: AgendaEntry<T>[] = [];
    let newlyOngoing = false;
    for (const item of items) {
      if (!coversDay(item, day, timezone)) continue;
      const until = lastDays.get(item.id) ?? null;
      if (!until) {
        single.push({ item, until });
        continue;
      }
      if (shown.has(item.id)) {
        ongoing.push({ item, until });
        continue;
      }
      shown.add(item.id);
      const start = firstDay(item, timezone);
      if (start && start < day) {
        newlyOngoing = true;
        ongoing.push({ item, until });
      } else starting.push({ item, until });
    }
    const dayItems = [...single, ...starting];
    if (dayItems.length > 0 || newlyOngoing) groups.push({ day, items: dayItems, ongoing });
  }
  return groups;
}

export type AllDayBar<T> = { item: T; lane: number; startColumn: number; endColumn: number };

const LANE_PRIORITY: Record<string, number> = { event: 0, focus: 0, deadline: 1, milestone: 1, task: 2, project: 3 };

/**
 * Lays out all-day items of a week as horizontal bars. Columns are 0-based day indexes,
 * `endColumn` is exclusive. Concrete appointments get the top lanes, long project spans last.
 */
export function layoutAllDayBars<T extends SpanItem>(items: T[], days: string[]) {
  if (days.length === 0) return [];
  const first = days[0];
  const candidates = items
    .filter((item) => item.allDay && item.startDate && item.endDate)
    .map((item) => ({
      item,
      startColumn: Math.max(0, daysBetween(first, item.startDate!)),
      endColumn: Math.min(days.length, daysBetween(first, item.endDate!)),
    }))
    .filter((bar) => bar.endColumn > bar.startColumn)
    .sort(
      (a, b) =>
        (LANE_PRIORITY[a.item.kind] ?? 2) - (LANE_PRIORITY[b.item.kind] ?? 2) ||
        a.startColumn - b.startColumn ||
        b.endColumn - b.startColumn - (a.endColumn - a.startColumn) ||
        a.item.id.localeCompare(b.item.id),
    );
  const lanes: boolean[][] = [];
  const bars: AllDayBar<T>[] = [];
  for (const bar of candidates) {
    let lane = lanes.findIndex((used) => used.slice(bar.startColumn, bar.endColumn).every((taken) => !taken));
    if (lane < 0) {
      lane = lanes.length;
      lanes.push(Array.from({ length: days.length }, () => false));
    }
    for (let column = bar.startColumn; column < bar.endColumn; column += 1) lanes[lane][column] = true;
    bars.push({ ...bar, lane });
  }
  return bars;
}
