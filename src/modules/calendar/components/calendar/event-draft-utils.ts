// Builds event-form drafts: a blank draft for new events and a draft from an existing calendar item.
// Used by calendar-client.tsx.
import { addDays, zonedParts } from "../../date-utils";
import type { CalendarItem } from "../../types";
import type { EventDraft } from "./calendar-types";

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function blankDraft(
  calendarId: string,
  timezone: string,
  date = localDate(),
  hour = 9,
): EventDraft {
  const startHour = Math.min(23, Math.max(0, Math.trunc(hour)));
  const endHour = (startHour + 1) % 24;
  return {
    calendarId,
    kind: "event",
    title: "",
    description: "",
    location: "",
    address: "",
    allDay: false,
    startDate: date,
    endDate: startHour === 23 ? addDays(date, 1) : date,
    startTime: `${String(startHour).padStart(2, "0")}:00`,
    endTime: `${String(endHour).padStart(2, "0")}:00`,
    timezone,
    availability: "busy",
    repeat: "none",
    attendeeIds: [],
    reminderMinutes: 15,
    expectedUpdatedAt: null,
    occurrenceKey: null,
    recurring: false,
    scope: "series",
  };
}

export function itemDraft(
  item: CalendarItem,
  fallbackCalendarId: string,
  timezone: string,
): EventDraft {
  const start = item.startAt ? new Date(item.startAt) : null;
  const end = item.endAt ? new Date(item.endAt) : null;
  const eventTimezone = item.timezone ?? timezone;
  const startParts = start ? zonedParts(start, eventTimezone) : null;
  const endParts = end ? zonedParts(end, eventTimezone) : null;
  const timedStartDate = startParts
    ? `${startParts.year}-${String(startParts.month).padStart(2, "0")}-${String(startParts.day).padStart(2, "0")}`
    : localDate();
  const timedEndDate = endParts
    ? `${endParts.year}-${String(endParts.month).padStart(2, "0")}-${String(endParts.day).padStart(2, "0")}`
    : addDays(timedStartDate, 1);
  const rule = item.recurrenceRule ?? "";
  return {
    id: item.sourceId,
    calendarId: item.calendarId ?? fallbackCalendarId,
    kind: item.kind === "focus" ? "focus" : "event",
    title: item.title,
    description: item.description,
    location: item.location,
    address: item.address,
    allDay: item.allDay,
    startDate: item.startDate ?? timedStartDate,
    endDate: item.endDate ?? timedEndDate,
    startTime: startParts
      ? `${String(startParts.hour).padStart(2, "0")}:${String(startParts.minute).padStart(2, "0")}`
      : "09:00",
    endTime: endParts
      ? `${String(endParts.hour).padStart(2, "0")}:${String(endParts.minute).padStart(2, "0")}`
      : "10:00",
    timezone: eventTimezone,
    availability: item.availability,
    repeat: rule.includes("FREQ=DAILY")
      ? "daily"
      : rule.includes("FREQ=WEEKLY")
        ? "weekly"
        : rule.includes("FREQ=MONTHLY")
          ? "monthly"
          : "none",
    attendeeIds: item.attendeeIds,
    reminderMinutes: 15,
    expectedUpdatedAt: item.updatedAt,
    occurrenceKey: item.occurrenceKey,
    recurring: item.recurring,
    scope: item.recurring ? "occurrence" : "series",
  };
}
