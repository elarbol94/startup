// Pure interval maths for the team free/busy timeline. All values are
// minutes since local midnight of one calendar day (0–1440).

export type Interval = { start: number; end: number };

const DEFAULT_RANGE: Interval = { start: 8 * 60, end: 17 * 60 };

/** "08:30" → 510; returns null for anything that is not a valid HH:MM clock. */
export function clockToMinutes(value: string | null | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59 || (hours === 24 && minutes > 0)) return null;
  return hours * 60 + minutes;
}

/** 510 → "08:30" (1440 → "24:00"). */
export function minutesToClock(value: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(value)));
  const hours = Math.floor(clamped / 60);
  return `${String(hours).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

/** The working day from the preferences, falling back to 08–17 when invalid. */
export function workingRange(start: string, end: string): Interval {
  const from = clockToMinutes(start);
  const to = clockToMinutes(end);
  if (from === null || to === null || to <= from) return { ...DEFAULT_RANGE };
  return { start: from, end: to };
}

/** Intersects an interval with a range; null when nothing remains. */
export function clipInterval(interval: Interval, range: Interval): Interval | null {
  const start = Math.max(interval.start, range.start);
  const end = Math.min(interval.end, range.end);
  return end > start ? { start, end } : null;
}

/** Sorts and merges overlapping or touching intervals; drops empty ones. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((interval) => interval.end > interval.start)
    .map((interval) => ({ start: interval.start, end: interval.end }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged.at(-1);
    if (last && interval.start <= last.end) last.end = Math.max(last.end, interval.end);
    else merged.push(interval);
  }
  return merged;
}

/** Gaps inside `range` not covered by any busy interval, at least `minLength` long. */
export function freeWindows(busy: Interval[], range: Interval, minLength = 30): Interval[] {
  const clipped = busy
    .map((interval) => clipInterval(interval, range))
    .filter((interval): interval is Interval => interval !== null);
  const windows: Interval[] = [];
  let cursor = range.start;
  for (const interval of mergeIntervals(clipped)) {
    if (interval.start > cursor) windows.push({ start: cursor, end: interval.start });
    cursor = Math.max(cursor, interval.end);
  }
  if (range.end > cursor) windows.push({ start: cursor, end: range.end });
  return windows.filter((window) => window.end - window.start >= minLength);
}

/**
 * Places overlapping intervals in parallel lanes. `lanes` is the lane count of
 * the overlap cluster the interval belongs to, so each cluster uses its height fully.
 */
export function assignLanes<T extends Interval>(
  intervals: T[],
): { item: T; lane: number; lanes: number }[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: { item: T; lane: number; lanes: number }[] = [];
  let cluster: { item: T; lane: number; lanes: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const closeCluster = () => {
    for (const entry of cluster) entry.lanes = laneEnds.length;
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    if (item.start >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane < 0) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    cluster.push({ item, lane, lanes: 0 });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  closeCluster();
  return placed;
}

/** Full-hour tick positions (minutes) inside the range, every `stepHours` hours. */
export function hourTicks(range: Interval, stepHours: number): number[] {
  const step = Math.max(1, Math.round(stepHours)) * 60;
  const ticks: number[] = [];
  for (let value = Math.ceil(range.start / step) * step; value < range.end; value += step) {
    ticks.push(value);
  }
  return ticks;
}

/** Position of an interval inside the range, as CSS percentages. */
export function percentOf(interval: Interval, range: Interval): { left: number; width: number } {
  const span = range.end - range.start || 1;
  return {
    left: ((interval.start - range.start) / span) * 100,
    width: ((interval.end - interval.start) / span) * 100,
  };
}
