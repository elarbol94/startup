import { addDays, dateAndMinutesInZone, daysBetween, zonedDateTimeToUtc } from "./date-utils";

export function timedDaySegment(startAt: string | null, endAt: string | null, day: string, timezone: string) {
  if (!startAt || !endAt) return null;
  const start = dateAndMinutesInZone(new Date(startAt), timezone);
  const end = dateAndMinutesInZone(new Date(endAt), timezone);
  const from = daysBetween(day, start.date) * 1440 + start.minutes;
  const to = daysBetween(day, end.date) * 1440 + end.minutes;
  if (from >= 1440 || to <= 0 || to <= from) return null;
  return { start: Math.max(0, from), end: Math.min(1440, to), startsHere: from >= 0, endsHere: to <= 1440 };
}

export type TimeDragMode = "move" | "start" | "end";
export function adjustEventRange(startAt: string, endAt: string, mode: TimeDragMode, deltaMinutes: number, deltaDays: number, timezone: string) {
  const originalStart = new Date(startAt).getTime();
  const originalEnd = new Date(endAt).getTime();
  const local = dateAndMinutesInZone(new Date(mode === "end" ? endAt : startAt), timezone);
  const minutes = Math.round((local.minutes + deltaMinutes) / 15) * 15;
  const date = addDays(local.date, deltaDays + Math.floor(minutes / 1440));
  const clock = ((minutes % 1440) + 1440) % 1440;
  const [year, month, day] = date.split("-").map(Number);
  const moved = zonedDateTimeToUtc({ year, month, day, hour: Math.floor(clock / 60), minute: clock % 60 }, timezone).getTime();
  const start = mode === "end" ? originalStart : mode === "start" ? Math.min(moved, originalEnd - 900_000) : moved;
  const end = mode === "move" ? start + originalEnd - originalStart : mode === "end" ? Math.max(moved, originalStart + 900_000) : originalEnd;
  return { startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
}
