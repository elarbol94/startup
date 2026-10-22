import { localDateInZone } from "@/modules/calendar/date-utils";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}

/** Formats the calendar day used by the Austrian accounting records. */
export const toLocalIsoDate = (date = new Date()) => localDateInZone(date, "Europe/Vienna");
