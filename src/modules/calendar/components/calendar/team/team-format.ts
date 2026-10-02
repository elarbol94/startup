import type { CalendarItem } from "../../../types";
import { minutesToClock, type Interval } from "./free-busy";

/** "10:00–11:00" for a timed item, in the calendar timezone. */
export function itemTimeRange(item: CalendarItem, locale: string, timezone: string) {
  if (!item.startAt || !item.endAt) return "";
  const format = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: timezone,
  });
  return `${format.format(new Date(item.startAt))}–${format.format(new Date(item.endAt))}`;
}

export function intervalLabel(interval: Interval) {
  return `${minutesToClock(interval.start)}–${minutesToClock(interval.end)}`;
}

/** Tick spacing that stays legible: hourly for one day, 2h for a work week, else 4h. */
export function tickStepHours(dayCount: number) {
  if (dayCount <= 1) return 1;
  return dayCount <= 5 ? 2 : 4;
}
