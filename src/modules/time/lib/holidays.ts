import { addDays, isoDate } from "@/modules/calendar/date-utils";

export type AustrianHoliday =
  | "newYear"
  | "epiphany"
  | "easterMonday"
  | "labourDay"
  | "ascension"
  | "whitMonday"
  | "corpusChristi"
  | "assumption"
  | "nationalDay"
  | "allSaints"
  | "immaculateConception"
  | "christmas"
  | "stStephen";

/** Easter Sunday (Gregorian, anonymous algorithm) as YYYY-MM-DD. */
export function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return isoDate(new Date(Date.UTC(year, month - 1, day)));
}

const cache = new Map<number, Map<string, AustrianHoliday>>();

/** Nationwide statutory public holidays in Austria (Feiertagsruhegesetz). */
export function austrianHolidays(year: number): Map<string, AustrianHoliday> {
  const cached = cache.get(year);
  if (cached) return cached;
  const easter = easterSunday(year);
  const fixed = (month: number, day: number) =>
    `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const holidays = new Map<string, AustrianHoliday>([
    [fixed(1, 1), "newYear"],
    [fixed(1, 6), "epiphany"],
    [addDays(easter, 1), "easterMonday"],
    [fixed(5, 1), "labourDay"],
    [addDays(easter, 39), "ascension"],
    [addDays(easter, 50), "whitMonday"],
    [addDays(easter, 60), "corpusChristi"],
    [fixed(8, 15), "assumption"],
    [fixed(10, 26), "nationalDay"],
    [fixed(11, 1), "allSaints"],
    [fixed(12, 8), "immaculateConception"],
    [fixed(12, 25), "christmas"],
    [fixed(12, 26), "stStephen"],
  ]);
  cache.set(year, holidays);
  return holidays;
}

export function austrianHolidayOn(date: string): AustrianHoliday | null {
  return austrianHolidays(Number(date.slice(0, 4))).get(date) ?? null;
}
