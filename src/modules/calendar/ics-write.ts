// Serializes one calendar event (with its moved and cancelled occurrences) as an
// iCalendar object, the inverse of ics-feed.ts for the fields both sides know.
// Used by caldav-sync.ts to push events to Nextcloud.
import { addDays, daysBetween, isValidTimezone, zonedDateTimeToUtc, zonedParts } from "./date-utils";
import type { IcsOccurrenceOverride } from "./ics-feed";

export type WritableEvent = {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startAt: Date | null;
  endAt: Date | null;
  timezone: string;
  availability: "busy" | "free";
  recurrenceRule: string | null;
  updatedAt: Date;
};

export type WritableException = { occurrenceKey: string; cancelled: boolean; overrideJson: string };

const pad = (value: number) => String(value).padStart(2, "0");

function utcStamp(at: Date) {
  return at.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function localStamp(at: Date, zone: string) {
  const parts = zonedParts(at, zone);
  return `${parts.year}${pad(parts.month)}${pad(parts.day)}T${pad(parts.hour)}${pad(parts.minute)}${pad(parts.second)}`;
}

const dateStamp = (date: string) => date.replace(/-/g, "");

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 folding: lines longer than 75 octets continue on a line starting with a space. */
function fold(line: string) {
  const out: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char);
    if (bytes + size > (out.length ? 74 : 75)) {
      out.push(current);
      current = "";
      bytes = 0;
    }
    current += char;
    bytes += size;
  }
  out.push(current);
  return out.join("\r\n ");
}

/**
 * Timed series keep their zone so they expand across DST like in the app; single
 * timed events are written in UTC, which every client reads without a VTIMEZONE.
 * shortcut: no VTIMEZONE blocks, Nextcloud resolves IANA TZIDs itself; add them if another server needs it.
 */
function timeProperty(name: string, at: Date, zone: string | null) {
  return zone ? `${name};TZID=${zone}:${localStamp(at, zone)}` : `${name}:${utcStamp(at)}`;
}

/** The app stores a floating UNTIL on the event's wall clock; RFC 5545 wants UTC next to a TZID. */
function ruleLine(rule: string, zone: string | null) {
  const value = rule.split(/\r?\n/).find((line) => line.startsWith("RRULE:"))?.slice(6) ?? rule.replace(/^RRULE:/, "");
  if (!zone) return `RRULE:${value}`;
  return `RRULE:${value.replace(/UNTIL=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(?!Z)/i, (_, year, month, day, hour, minute, second) =>
    `UNTIL=${utcStamp(zonedDateTimeToUtc({ year: +year, month: +month, day: +day, hour: +hour, minute: +minute, second: +second }, zone))}`)}`;
}

function overrides(value: string): IcsOccurrenceOverride {
  try {
    return JSON.parse(value) as IcsOccurrenceOverride;
  } catch {
    return {};
  }
}

export function eventToIcs(uid: string, event: WritableEvent, exceptions: WritableException[] = []) {
  const recurring = Boolean(event.recurrenceRule);
  const zone = recurring && !event.allDay && event.timezone !== "UTC" && isValidTimezone(event.timezone) ? event.timezone : null;
  const stamp = `DTSTAMP:${utcStamp(new Date())}`;
  const textLines = (source: { title?: string; description?: string; location?: string }) => [
    `SUMMARY:${escapeText(source.title ?? event.title)}`,
    ...((source.description ?? event.description) ? [`DESCRIPTION:${escapeText(source.description ?? event.description)}`] : []),
    ...((source.location ?? event.location) ? [`LOCATION:${escapeText(source.location ?? event.location)}`] : []),
  ];
  const span = (start: { date?: string | null; at?: Date | null }, end: { date?: string | null; at?: Date | null }) =>
    event.allDay
      ? [`DTSTART;VALUE=DATE:${dateStamp(start.date!)}`, `DTEND;VALUE=DATE:${dateStamp(end.date!)}`]
      : [timeProperty("DTSTART", start.at!, zone), timeProperty("DTEND", end.at!, zone)];
  const recurrenceId = (key: string) =>
    event.allDay ? `RECURRENCE-ID;VALUE=DATE:${dateStamp(key)}` : timeProperty("RECURRENCE-ID", new Date(key), zone);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Management Platform//Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    stamp,
    `LAST-MODIFIED:${utcStamp(event.updatedAt)}`,
    ...textLines({}),
    ...span({ date: event.startDate, at: event.startAt }, { date: event.endDate, at: event.endAt }),
    `TRANSP:${event.availability === "free" ? "TRANSPARENT" : "OPAQUE"}`,
  ];
  if (recurring) {
    lines.push(ruleLine(event.recurrenceRule!, zone));
    for (const exception of exceptions.filter((entry) => entry.cancelled)) {
      lines.push(event.allDay ? `EXDATE;VALUE=DATE:${dateStamp(exception.occurrenceKey)}` : timeProperty("EXDATE", new Date(exception.occurrenceKey), zone));
    }
  }
  lines.push("END:VEVENT");

  if (recurring) {
    for (const exception of exceptions.filter((entry) => !entry.cancelled)) {
      const changed = overrides(exception.overrideJson);
      const key = exception.occurrenceKey;
      lines.push("BEGIN:VEVENT", `UID:${uid}`, stamp, recurrenceId(key), ...textLines(changed));
      if (event.allDay) {
        const length = daysBetween(event.startDate!, event.endDate!);
        lines.push(...span({ date: changed.startDate ?? key }, { date: changed.endDate ?? addDays(changed.startDate ?? key, length) }));
      } else {
        const start = new Date(changed.startAt ?? key);
        const length = event.endAt!.getTime() - event.startAt!.getTime();
        lines.push(...span({ at: start }, { at: changed.endAt ? new Date(changed.endAt) : new Date(start.getTime() + length) }));
      }
      lines.push("END:VEVENT");
    }
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
