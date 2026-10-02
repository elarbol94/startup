// Parses a whole iCalendar (.ics) feed into calendar events, including recurring
// series with their moved and cancelled occurrences.
// Used by ics-sync.ts for Google Calendar subscriptions and one-time imports.
import { RRule } from "rrule";
import {
  addDays,
  isValidTimezone,
  zonedDateTimeToUtc,
  zonedParts,
} from "./date-utils";
import { validateRecurrenceRule } from "./recurrence";

export type IcsOccurrenceOverride = {
  title?: string;
  description?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  startAt?: string;
  endAt?: string;
};

export type IcsException = {
  /** Same key format as `expandEventOccurrences`: a date, or the UTC ISO start. */
  occurrenceKey: string;
  cancelled: boolean;
  override: IcsOccurrenceOverride;
};

export type IcsEvent = {
  uid: string;
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
  exceptions: IcsException[];
};

export type IcsFeed = {
  name?: string;
  timezone?: string;
  events: IcsEvent[];
  /** Events left out because they were invalid, cancelled, too old or over the limit. */
  skipped: number;
  truncated: boolean;
};

type Property = { params: Record<string, string>; value: string };
type RawEvent = Map<string, Property[]>;
type IcsTime =
  | { kind: "date"; date: string }
  | { kind: "time"; at: Date; zone: string | null; utc: boolean };

const UNTITLED = "(No title)";
const DEFAULT_DURATION_MS = 60 * 60_000;

/** Splits `NAME;PARAM=a;PARAM="b:c":value`, honouring quoted parameter values. */
function parseLine(line: string): { name: string; property: Property } | null {
  let index = 0;
  let quoted = false;
  const segments: string[] = [];
  let current = "";
  for (; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') quoted = !quoted;
    if (!quoted && (char === ";" || char === ":")) {
      segments.push(current);
      current = "";
      if (char === ":") break;
      continue;
    }
    current += char;
  }
  if (index >= line.length) return null;
  const [name, ...rawParams] = segments;
  if (!name || !/^[A-Za-z0-9-]+$/.test(name)) return null;
  const params: Record<string, string> = {};
  for (const raw of rawParams) {
    const separator = raw.indexOf("=");
    if (separator <= 0) continue;
    params[raw.slice(0, separator).toUpperCase()] = raw
      .slice(separator + 1)
      .replace(/^"|"$/g, "");
  }
  return {
    name: name.toUpperCase(),
    property: { params, value: line.slice(index + 1) },
  };
}

function unescapeText(value: string) {
  return value
    .replace(/\\([\\;,nN])/g, (_, char: string) =>
      char === "n" || char === "N" ? "\n" : char,
    )
    .trim();
}

function first(event: RawEvent, name: string) {
  return event.get(name)?.[0];
}

function textValue(event: RawEvent, name: string, maxLength: number) {
  const property = first(event, name);
  return property ? unescapeText(property.value).slice(0, maxLength) : "";
}

/** Resolves a TZID to an IANA zone; vendor prefixes like `/mozilla.org/…/Europe/Vienna` are stripped. */
function resolveZone(tzid: string | undefined) {
  if (!tzid) return null;
  if (isValidTimezone(tzid)) return tzid;
  const parts = tzid.split("/").filter(Boolean);
  for (let start = Math.max(0, parts.length - 3); start < parts.length; start += 1) {
    const candidate = parts.slice(start).join("/");
    if (isValidTimezone(candidate)) return candidate;
  }
  return null;
}

function isoDateParts(year: string, month: string, day: string) {
  return `${year}-${month}-${day}`;
}

function parseTime(
  value: string,
  params: Record<string, string>,
  floatingZone: string,
): IcsTime | null {
  const trimmed = value.trim();
  const date = trimmed.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (date) return { kind: "date", date: isoDateParts(date[1], date[2], date[3]) };
  const dateTime = trimmed.match(
    /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/,
  );
  if (!dateTime) return null;
  const parts = {
    year: Number(dateTime[1]),
    month: Number(dateTime[2]),
    day: Number(dateTime[3]),
    hour: Number(dateTime[4]),
    minute: Number(dateTime[5]),
    second: Number(dateTime[6] ?? 0),
  };
  if (dateTime[7]) {
    return {
      kind: "time",
      at: new Date(
        Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second),
      ),
      zone: null,
      utc: true,
    };
  }
  const zone = resolveZone(params.TZID);
  return {
    kind: "time",
    at: zonedDateTimeToUtc(parts, zone ?? floatingZone),
    zone,
    utc: false,
  };
}

function propertyTime(
  property: Property | undefined,
  floatingZone: string,
) {
  if (!property) return null;
  return parseTime(property.value, property.params, floatingZone);
}

/** Only day/week/time durations; months and years are not valid in DURATION. */
function durationMs(value: string | undefined) {
  const match = value
    ?.trim()
    .match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!match) return null;
  const [, sign, weeks, days, hours, minutes, seconds] = match;
  const total =
    Number(weeks ?? 0) * 7 * 86_400_000 +
    Number(days ?? 0) * 86_400_000 +
    Number(hours ?? 0) * 3_600_000 +
    Number(minutes ?? 0) * 60_000 +
    Number(seconds ?? 0) * 1_000;
  return sign === "-" ? -total : total;
}

function dateInZone(at: Date, zone: string) {
  const parts = zonedParts(at, zone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

/**
 * Recurrences expand on the event's wall clock, so a UTC `UNTIL` is moved onto
 * that clock; unsupported (sub-daily) or malformed rules yield null.
 */
function normalizeRule(value: string | undefined, zone: string, allDay: boolean) {
  if (!value) return null;
  let rule = value.trim().replace(/^RRULE:/i, "");
  if (!allDay) {
    rule = rule.replace(
      /UNTIL=(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/i,
      (_, year, month, day, hour, minute, second) => {
        const parts = zonedParts(
          new Date(Date.UTC(+year, +month - 1, +day, +hour, +minute, +second)),
          zone,
        );
        const pad = (part: number) => String(part).padStart(2, "0");
        return `UNTIL=${parts.year}${pad(parts.month)}${pad(parts.day)}T${pad(parts.hour)}${pad(parts.minute)}${pad(parts.second)}`;
      },
    );
  }
  try {
    const validated = validateRecurrenceRule(rule);
    RRule.parseString(validated ?? "");
    return validated;
  } catch {
    return null;
  }
}

function occurrenceKeyFor(time: IcsTime, allDay: boolean, zone: string) {
  if (allDay) return time.kind === "date" ? time.date : dateInZone(time.at, zone);
  return time.kind === "time" ? time.at.toISOString() : null;
}

type Span = Pick<IcsEvent, "allDay" | "startDate" | "endDate" | "startAt" | "endAt">;

function eventSpan(event: RawEvent, floatingZone: string): (Span & { start: IcsTime }) | null {
  const start = propertyTime(first(event, "DTSTART"), floatingZone);
  if (!start) return null;
  const end = propertyTime(first(event, "DTEND"), floatingZone);
  const duration = durationMs(first(event, "DURATION")?.value);
  if (start.kind === "date") {
    let endDate =
      end?.kind === "date"
        ? end.date
        : duration !== null
          ? addDays(start.date, Math.round(duration / 86_400_000))
          : addDays(start.date, 1);
    if (endDate <= start.date) endDate = addDays(start.date, 1);
    return { start, allDay: true, startDate: start.date, endDate, startAt: null, endAt: null };
  }
  let endAt =
    end?.kind === "time"
      ? end.at
      : duration !== null
        ? new Date(start.at.getTime() + duration)
        : new Date(start.at.getTime() + DEFAULT_DURATION_MS);
  if (endAt <= start.at) endAt = new Date(start.at.getTime() + DEFAULT_DURATION_MS);
  return { start, allDay: false, startDate: null, endDate: null, startAt: start.at, endAt };
}

function isCancelled(event: RawEvent) {
  return first(event, "STATUS")?.value.trim().toUpperCase() === "CANCELLED";
}

function readComponents(text: string) {
  const unfolded = text.replace(/^﻿/, "").replace(/\r?\n[ \t]/g, "");
  const calendar = new Map<string, string>();
  const events: RawEvent[] = [];
  const stack: string[] = [];
  let current: RawEvent | null = null;
  for (const line of unfolded.split(/\r?\n/)) {
    if (!line) continue;
    const parsed = parseLine(line);
    if (!parsed) continue;
    const { name, property } = parsed;
    if (name === "BEGIN") {
      const component = property.value.trim().toUpperCase();
      stack.push(component);
      if (component === "VEVENT" && stack.length === 2 && stack[0] === "VCALENDAR") {
        current = new Map();
      }
      continue;
    }
    if (name === "END") {
      const component = stack.pop();
      if (component === "VEVENT" && current) {
        events.push(current);
        current = null;
      }
      continue;
    }
    const top = stack.at(-1);
    if (top === "VEVENT" && current) {
      const values = current.get(name) ?? [];
      values.push(property);
      current.set(name, values);
    } else if (top === "VCALENDAR" && !calendar.has(name)) {
      calendar.set(name, property.value);
    }
  }
  return { calendar, events };
}

export function looksLikeIcs(text: string) {
  return /BEGIN:VCALENDAR/i.test(text.slice(0, 4_096));
}

/**
 * Converts every VEVENT of an iCalendar document. Times without a zone use the
 * feed's X-WR-TIMEZONE, else `fallbackTimezone`. With `endsAfter`, single events
 * that ended before it are skipped (series are always kept).
 */
export function parseIcsFeed(
  text: string,
  options: { fallbackTimezone: string; endsAfter?: Date; maxEvents?: number },
): IcsFeed {
  const { calendar, events: rawEvents } = readComponents(text);
  const feedZone = resolveZone(calendar.get("X-WR-TIMEZONE")?.trim());
  const floatingZone = feedZone ?? options.fallbackTimezone;
  const maxEvents = options.maxEvents ?? Number.POSITIVE_INFINITY;

  const masters = new Map<string, RawEvent>();
  const overrides = new Map<string, RawEvent[]>();
  let skipped = 0;
  rawEvents.forEach((event, index) => {
    const uid = first(event, "UID")?.value.trim() ||
      `generated:${first(event, "DTSTART")?.value ?? index}:${first(event, "SUMMARY")?.value ?? ""}`;
    if (first(event, "RECURRENCE-ID")) {
      const values = overrides.get(uid) ?? [];
      values.push(event);
      overrides.set(uid, values);
    } else if (masters.has(uid)) {
      skipped += 1;
    } else {
      masters.set(uid, event);
    }
  });

  const events: IcsEvent[] = [];
  let truncated = false;
  const push = (event: IcsEvent) => {
    if (events.length >= maxEvents) {
      truncated = true;
      skipped += 1;
      return;
    }
    events.push(event);
  };

  const build = (uid: string, raw: RawEvent, recurring: boolean): IcsEvent | null => {
    const span = eventSpan(raw, floatingZone);
    if (!span) return null;
    const startZone = span.start.kind === "time" ? span.start.zone : null;
    const timezone =
      startZone ??
      (span.start.kind === "time" && span.start.utc && recurring ? "UTC" : floatingZone);
    const recurrenceRule = recurring
      ? normalizeRule(first(raw, "RRULE")?.value, timezone, span.allDay)
      : null;
    return {
      uid: uid.slice(0, 1_000),
      title: textValue(raw, "SUMMARY", 240) || UNTITLED,
      description: textValue(raw, "DESCRIPTION", 10_000),
      location: textValue(raw, "LOCATION", 500),
      allDay: span.allDay,
      startDate: span.startDate,
      endDate: span.endDate,
      startAt: span.startAt,
      endAt: span.endAt,
      timezone,
      availability:
        first(raw, "TRANSP")?.value.trim().toUpperCase() === "TRANSPARENT" ? "free" : "busy",
      recurrenceRule,
      exceptions: [],
    };
  };

  for (const [uid, raw] of masters) {
    if (isCancelled(raw)) {
      skipped += 1;
      continue;
    }
    const event = build(uid, raw, Boolean(first(raw, "RRULE")));
    if (!event) {
      skipped += 1;
      continue;
    }
    if (!event.recurrenceRule) {
      const end = event.endAt ?? (event.endDate ? new Date(`${event.endDate}T00:00:00Z`) : null);
      if (options.endsAfter && end && end < options.endsAfter) {
        skipped += 1;
        continue;
      }
      push(event);
      continue;
    }
    const exceptions = new Map<string, IcsException>();
    for (const exdate of raw.get("EXDATE") ?? []) {
      for (const value of exdate.value.split(",")) {
        const time = parseTime(value, exdate.params, event.timezone);
        const key = time && occurrenceKeyFor(time, event.allDay, event.timezone);
        if (key) exceptions.set(key, { occurrenceKey: key, cancelled: true, override: {} });
      }
    }
    for (const override of overrides.get(uid) ?? []) {
      const recurrenceId = propertyTime(first(override, "RECURRENCE-ID"), event.timezone);
      const key = recurrenceId && occurrenceKeyFor(recurrenceId, event.allDay, event.timezone);
      if (!key) continue;
      if (isCancelled(override)) {
        exceptions.set(key, { occurrenceKey: key, cancelled: true, override: {} });
        continue;
      }
      const span = eventSpan(override, event.timezone);
      const changed: IcsOccurrenceOverride = {
        title: textValue(override, "SUMMARY", 240) || event.title,
        description: textValue(override, "DESCRIPTION", 10_000),
        location: textValue(override, "LOCATION", 500),
      };
      if (span && event.allDay && span.allDay) {
        changed.startDate = span.startDate!;
        changed.endDate = span.endDate!;
      } else if (span && !event.allDay && !span.allDay) {
        changed.startAt = span.startAt!.toISOString();
        changed.endAt = span.endAt!.toISOString();
      }
      exceptions.set(key, { occurrenceKey: key, cancelled: false, override: changed });
    }
    overrides.delete(uid);
    push({ ...event, exceptions: [...exceptions.values()] });
  }

  // Moved occurrences whose series is not part of the feed become single events.
  for (const [uid, list] of overrides) {
    for (const raw of list) {
      const recurrenceId = first(raw, "RECURRENCE-ID")!.value.trim();
      if (isCancelled(raw) || masters.has(uid)) {
        skipped += 1;
        continue;
      }
      const event = build(`${uid}#${recurrenceId}`, raw, false);
      const end = event?.endAt ?? (event?.endDate ? new Date(`${event.endDate}T00:00:00Z`) : null);
      if (!event || (options.endsAfter && end && end < options.endsAfter)) {
        skipped += 1;
        continue;
      }
      push(event);
    }
  }

  return {
    name: calendar.get("X-WR-CALNAME")
      ? unescapeText(calendar.get("X-WR-CALNAME")!).slice(0, 120) || undefined
      : undefined,
    timezone: feedZone ?? undefined,
    events,
    skipped,
    truncated,
  };
}
