// Pure helpers for the calendar inspector: time-range text, meeting-link detection and
// safe linkification of free text. Tested in inspector-utils.test.ts.
import { addDays } from "../../../date-utils";
import { formatAustrianDate } from "../../../localized-date-time";

type RangeInput = {
  allDay: boolean;
  startDate: string | null;
  endDate: string | null;
  startAt: string | null;
  endAt: string | null;
};

/** "1 h", "30 min", "1 h 30 min"; empty for zero or negative spans. */
export function formatDurationShort(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

function dayKey(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Human-readable range for an item.
 * Timed, same day:   "Fr., 2. Okt. 2026 · 10:00–11:00 (1 h)"
 * Timed, multi-day:  "Fr., 2. Okt. 2026, 22:00 – Sa., 3. Okt. 2026, 02:00 (4 h)"
 * All-day:           "02.10.2026" or "02.10.2026 – 04.10.2026" (end date is exclusive in data)
 */
export function formatItemTimeRange(item: RangeInput, locale: string, timezone: string) {
  if (item.allDay) {
    if (!item.startDate) return "";
    const lastDay = item.endDate ? addDays(item.endDate, -1) : item.startDate;
    return lastDay <= item.startDate
      ? formatAustrianDate(item.startDate)
      : `${formatAustrianDate(item.startDate)} – ${formatAustrianDate(lastDay)}`;
  }
  if (!item.startAt) return "";
  const start = new Date(item.startAt);
  const end = item.endAt ? new Date(item.endAt) : null;
  const dateFormat = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timeFormat = new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  if (!end || end <= start) return `${dateFormat.format(start)} · ${timeFormat.format(start)}`;
  const duration = formatDurationShort((end.getTime() - start.getTime()) / 60_000);
  const suffix = duration ? ` (${duration})` : "";
  if (dayKey(start, timezone) === dayKey(end, timezone)) {
    return `${dateFormat.format(start)} · ${timeFormat.format(start)}–${timeFormat.format(end)}${suffix}`;
  }
  return `${dateFormat.format(start)}, ${timeFormat.format(start)} – ${dateFormat.format(end)}, ${timeFormat.format(end)}${suffix}`;
}

/** Returns the URL only when it parses and uses http(s). */
export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const URL_PATTERN = /https?:\/\/[^\s<>"'`]+/gi;
const MEETING_HOST_PATTERN =
  /(?:^|[\s(])((?:[\w-]+\.)*(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com)(?:\/[^\s<>"'`]*)?)/i;

/** Strips trailing sentence punctuation and an unbalanced closing parenthesis. */
function trimUrl(raw: string) {
  let url = raw.replace(/[.,;:!?]+$/, "");
  while (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    url = url.slice(0, -1).replace(/[.,;:!?]+$/, "");
  }
  return url;
}

/** Finds a joinable meeting link in a location: any http(s) URL or a bare Meet/Zoom/Teams host. */
export function detectJoinUrl(location: string): string | null {
  if (!location) return null;
  const explicit = location.match(URL_PATTERN)?.[0];
  if (explicit) return safeHttpUrl(trimUrl(explicit));
  const bare = location.match(MEETING_HOST_PATTERN)?.[1];
  return bare ? safeHttpUrl(`https://${trimUrl(bare)}`) : null;
}

export type TextSegment = { type: "text"; value: string } | { type: "link"; value: string; href: string };

/** Splits free text into plain text and http(s) link segments for safe rendering. */
export function linkifyText(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const value = trimUrl(match[0]);
    const href = safeHttpUrl(value);
    if (!href) continue;
    if (start > cursor) segments.push({ type: "text", value: text.slice(cursor, start) });
    segments.push({ type: "link", value, href });
    cursor = start + value.length;
  }
  if (cursor < text.length) segments.push({ type: "text", value: text.slice(cursor) });
  return segments;
}
