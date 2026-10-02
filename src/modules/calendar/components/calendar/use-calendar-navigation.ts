"use client";

// URL state of the calendar page: view, date and filters. Navigations run in a transition (so
// the current grid stays interactive and can show a pending state), and the neighbouring
// periods and today are prefetched so arrow navigation feels instant. Used by calendar-client.tsx.
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { shiftPeriodDate } from "../../calendar-period";
import type { CalendarView, CalendarWorkspace } from "../../types";
import {
  CALENDAR_VIEWS,
  MOBILE_VIEW_STORAGE_KEY,
  type CalendarNavigateTarget,
  type FilterState,
} from "./calendar-types";
import { SOURCE_TYPES } from "./calendar-filter-utils";

type FilterGroup = "sources" | "people" | "projects" | "calendars";

export function calendarUrl(view: CalendarView, date: string, filters: FilterState) {
  const params = new URLSearchParams();
  params.set("view", view);
  params.set("date", date);
  if (filters.sources.length > 0) params.set("sources", filters.sources.join(","));
  if (filters.people.length > 0) params.set("people", filters.people.join(","));
  if (filters.projects.length > 0) params.set("projects", filters.projects.join(","));
  if (filters.calendars.length > 0) params.set("calendars", filters.calendars.join(","));
  if (filters.query) params.set("query", filters.query);
  return `/calendar?${params.toString()}`;
}

export function useCalendarNavigation({
  view,
  viewWasExplicit,
  date,
  today,
  initialFilters,
  workspace,
}: {
  view: CalendarView;
  viewWasExplicit: boolean;
  date: string;
  today: string;
  initialFilters: FilterState;
  workspace: CalendarWorkspace;
}) {
  const router = useRouter();
  const [navigating, startNavigation] = useTransition();
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const incomingFilterKey = JSON.stringify(initialFilters);
  const [syncedFilterKey, setSyncedFilterKey] = useState(incomingFilterKey);
  if (syncedFilterKey !== incomingFilterKey) {
    setSyncedFilterKey(incomingFilterKey);
    setFilters(initialFilters);
  }

  const buildUrl = (next: CalendarNavigateTarget) =>
    calendarUrl(next.view ?? view, next.date ?? date, next.filters ?? filters);

  function navigate(next: CalendarNavigateTarget) {
    const url = buildUrl(next);
    startNavigation(() => router.push(url));
  }

  function movePeriod(direction: number) {
    navigate({ date: shiftPeriodDate(view, date, direction) });
  }

  function goToday() {
    navigate({ date: today });
  }

  function updateFilters(next: FilterState) {
    setFilters(next);
    const url = buildUrl({ filters: next });
    startNavigation(() => router.replace(url));
  }

  function toggleFilter(group: FilterGroup, value: string) {
    const current =
      group === "sources" && filters.sources.length === 0
        ? [...SOURCE_TYPES]
        : group === "calendars" && filters.calendars.length === 0
          ? workspace.calendars.map((calendar) => calendar.id)
          : filters[group];
    const values = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    updateFilters({
      ...filters,
      [group]:
        values.length === 0 && (group === "sources" || group === "calendars")
          ? ["__none__"]
          : values.filter((id) => id !== "__none__"),
    });
  }

  function selectCalendars(ids: string[]) {
    updateFilters({ sources: [], people: [], projects: [], calendars: ids, query: "" });
  }

  // Warm the routes the arrow keys and the Today button lead to.
  const previousUrl = buildUrl({ date: shiftPeriodDate(view, date, -1) });
  const nextUrl = buildUrl({ date: shiftPeriodDate(view, date, 1) });
  const todayUrl = buildUrl({ date: today });
  useEffect(() => {
    const urls = new Set([previousUrl, nextUrl, todayUrl]);
    const timer = window.setTimeout(() => urls.forEach((url) => router.prefetch(url)), 300);
    return () => window.clearTimeout(timer);
  }, [previousUrl, nextUrl, todayUrl, router]);

  useEffect(() => {
    if (viewWasExplicit) return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    // Phones default to the agenda unless the person picked another view on this device.
    let preferred: CalendarView = "agenda";
    try {
      const stored = window.localStorage.getItem(MOBILE_VIEW_STORAGE_KEY);
      if (stored && (CALENDAR_VIEWS as readonly string[]).includes(stored)) preferred = stored as CalendarView;
    } catch {}
    if (preferred === view) return;
    const params = new URLSearchParams(window.location.search);
    params.set("view", preferred);
    params.set("date", date);
    router.replace(`/calendar?${params.toString()}`);
  }, [date, router, view, viewWasExplicit]);

  const activeFilterCount =
    filters.sources.length +
    filters.people.length +
    filters.projects.length +
    filters.calendars.length +
    (filters.query ? 1 : 0);

  return {
    router,
    navigating,
    filters,
    setFilters,
    buildUrl,
    navigate,
    movePeriod,
    goToday,
    updateFilters,
    toggleFilter,
    selectCalendars,
    activeFilterCount,
  };
}
