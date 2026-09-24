// Client-side state shapes for the calendar page (filters, drafts, import state).
// Used by calendar-client.tsx and the pieces in this folder.

export type FilterState = {
  sources: string[];
  people: string[];
  projects: string[];
  calendars: string[];
  query: string;
};

export type CalendarDraft = {
  id?: string;
  name: string;
  color: string;
  visibility: "private" | "busy" | "company";
};

export type EventDraft = {
  id?: string;
  calendarId: string;
  kind: "event" | "focus" | "absence";
  title: string;
  description: string;
  location: string;
  address: string;
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  timezone: string;
  availability: "busy" | "free";
  repeat: "none" | "daily" | "weekly" | "monthly";
  attendeeIds: string[];
  reminderMinutes: number | null;
  expectedUpdatedAt: string | null;
  occurrenceKey: string | null;
  recurring: boolean;
  scope: "occurrence" | "future" | "series";
};

export type ImportableDraftField =
  | "title"
  | "description"
  | "location"
  | "address"
  | "allDay"
  | "startDate"
  | "endDate"
  | "startTime"
  | "endTime"
  | "timezone"
  | "repeat";

export type ImportResult = {
  label: string;
  fields: string[];
  method: "ai" | "parser";
};

export type CalendarConflict = { id: string; title: string; startAt: string; endAt: string };
