// Shared types and helpers for the calendar sidebar sections (also reused by the filters dialog).
// Used by the files in this folder and calendar-filters-dialog.tsx.
import type { useTranslations } from "next-intl";
import type { CalendarSavedViewValue, CalendarWorkspace } from "../../../types";
import type { FilterState } from "../calendar-types";

export type CalendarT = ReturnType<typeof useTranslations<"calendar">>;
export type CalendarEntry = CalendarWorkspace["calendars"][number];

export const SIDEBAR_COLLAPSED_STORAGE_KEY = "calendar:sidebar-collapsed";

/** Normalises a saved view's partial filters into a full FilterState. */
export function savedViewFilters(saved: CalendarSavedViewValue): FilterState {
  return {
    sources: saved.filters.sources ?? [],
    people: saved.filters.people ?? [],
    projects: saved.filters.projects ?? [],
    calendars: saved.filters.calendars ?? [],
    query: saved.filters.query ?? "",
  };
}

/** Empty `filters.calendars` means every calendar is shown. */
export function isCalendarShown(filters: FilterState, calendarId: string) {
  return !filters.calendars.length || filters.calendars.includes(calendarId);
}
