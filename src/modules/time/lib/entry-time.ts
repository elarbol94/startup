import { addDays, parseDate, zonedDateTimeToUtc } from "@/modules/calendar/date-utils";

export const TIME_ZONE = "Europe/Vienna";
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseClock(value: string) {
  const match = CLOCK.exec(value);
  if (!match) throw new Error("Invalid time");
  return Number(match[1]) * 60 + Number(match[2]);
}

function instant(date: string, minutes: number) {
  const value = parseDate(date);
  return zonedDateTimeToUtc(
    {
      year: value.getUTCFullYear(),
      month: value.getUTCMonth() + 1,
      day: value.getUTCDate(),
      hour: Math.floor(minutes / 60),
      minute: minutes % 60,
    },
    TIME_ZONE,
  );
}

/**
 * Converts a local day plus HH:MM start/end into instants. An end before the
 * start is read as the next morning (overnight work); equal times are invalid.
 */
export function intervalFromClock(workDate: string, start: string, end: string) {
  const startMinutes = parseClock(start);
  const endMinutes = parseClock(end);
  if (startMinutes === endMinutes) throw new Error("Start and end are equal");
  const endDate = endMinutes < startMinutes ? addDays(workDate, 1) : workDate;
  return { startedAt: instant(workDate, startMinutes), endedAt: instant(endDate, endMinutes) };
}

export function overlaps(
  a: { startedAt: Date; endedAt: Date | null },
  b: { startedAt: Date; endedAt: Date | null },
  now: Date,
) {
  const aEnd = (a.endedAt ?? now).getTime();
  const bEnd = (b.endedAt ?? now).getTime();
  return a.startedAt.getTime() < bEnd && b.startedAt.getTime() < aEnd;
}
