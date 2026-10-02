// Client-side state shapes for the calendar page (filters, drafts, import state).
// Used by calendar-client.tsx and the pieces in this folder.
import type { CalendarView } from "../../types";

export const CALENDAR_VIEWS = ["day", "workweek", "week", "month", "agenda", "team"] as const satisfies readonly CalendarView[];
/** Message keys (calendar namespace) for the view switcher labels. */
export const CALENDAR_VIEW_LABELS = {
  day: "coreViewDay",
  workweek: "coreViewWorkweek",
  week: "week",
  month: "month",
  agenda: "agenda",
  team: "team",
} as const satisfies Record<CalendarView, string>;
/** Views drawn by the time grid (FlowWeek), with the number of day columns. */
export const TIME_GRID_DAYS: Partial<Record<CalendarView, number>> = { day: 1, workweek: 5, week: 7 };
// Whether items take their calendar's colour; on by default, remembered per device.
export const SHOW_COLORS_STORAGE_KEY = "calendar:show-colors";
// Remembers the view a person picked on a phone so the agenda default doesn't override it.
export const MOBILE_VIEW_STORAGE_KEY = "calendar:mobile-view";

export type CalendarNavigateTarget = { view?: CalendarView; date?: string; filters?: FilterState };

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

export type DraftProject = { id: string; name: string; color: string; archived: boolean };

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
  projects: DraftProject[];
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
