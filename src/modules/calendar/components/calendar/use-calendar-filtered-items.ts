"use client";

// Applies the active filters to the workspace items and unscheduled tasks.
// Used by calendar-client.tsx.
import { useMemo } from "react";
import type { CalendarWorkspace } from "../../types";
import type { FilterState } from "./calendar-types";
import { SOURCE_TYPES, typeSource } from "./calendar-filter-utils";

export function useCalendarFilteredItems(
  workspace: CalendarWorkspace,
  filters: FilterState,
  showCalendarColors: boolean,
) {
  const visibleSources = useMemo(
    () =>
      filters.sources.length > 0
        ? new Set(filters.sources)
        : new Set<string>(SOURCE_TYPES),
    [filters.sources],
  );
  const filteredItems = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase();
    return workspace.items.filter((item) => {
      if (!visibleSources.has(typeSource(item))) return false;
      if (
        filters.calendars.length > 0 &&
        (!item.calendarId || !filters.calendars.includes(item.calendarId))
      ) {
        return false;
      }
      if (
        filters.people.length > 0 &&
        !filters.people.some(
          (person) =>
            item.assigneeId === person || item.attendeeIds.includes(person),
        )
      ) {
        return false;
      }
      if (
        filters.projects.length > 0 &&
        (!item.projectId || !filters.projects.includes(item.projectId))
      ) {
        return false;
      }
      if (
        query &&
        !`${item.title} ${item.description} ${item.location} ${item.address}`
          .toLocaleLowerCase()
          .includes(query)
      ) {
        return false;
      }
      return true;
    });
  }, [filters, visibleSources, workspace.items]);
  const displayItems = useMemo(() => filteredItems.map((item) => ({ ...item, color: showCalendarColors ? item.color : "var(--muted-foreground)" })), [filteredItems, showCalendarColors]);
  const filteredUnscheduledTasks = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase();
    if (!visibleSources.has("task")) return [];
    return workspace.unscheduledTasks.filter((task) =>
      (filters.people.length === 0 || filters.people.some((id) => task.assigneeIds.includes(id))) &&
      (filters.projects.length === 0 || (task.projectId && filters.projects.includes(task.projectId))) &&
      (!query || task.title.toLocaleLowerCase().includes(query)),
    );
  }, [filters, visibleSources, workspace.unscheduledTasks]);
  return { visibleSources, displayItems, filteredUnscheduledTasks };
}
