"use client";

// Calendar page header: period label, period navigation, view switcher, filter and new-event buttons.
// Used by calendar-client.tsx.
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { localDateInZone } from "../../date-utils";
import type { CalendarView, CalendarWorkspace } from "../../types";
import type { FilterState } from "./calendar-types";

export function CalendarToolbar({
  periodLabel,
  t,
  movePeriod,
  navigate,
  workspace,
  view,
  ownCalendarIds,
  filters,
  selectCalendars,
  setFiltersOpen,
  activeFilterCount,
  openNewEvent,
  defaultCalendarId,
}: {
  periodLabel: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  movePeriod: (direction: number) => void;
  navigate: (next: { view?: CalendarView; date?: string; filters?: FilterState }) => void;
  workspace: CalendarWorkspace;
  view: CalendarView;
  ownCalendarIds: string[];
  filters: FilterState;
  selectCalendars: (ids: string[]) => void;
  setFiltersOpen: (open: boolean) => void;
  activeFilterCount: number;
  openNewEvent: (day?: string, hour?: number) => void;
  defaultCalendarId: string | undefined;
}) {
  return (
    <header className="flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between">
      <div>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{periodLabel}</h1>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-h-11 items-center rounded-lg border bg-background p-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("previous")}
            onClick={() => movePeriod(-1)}
          >
            <ArrowLeft />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              navigate({
                date: localDateInZone(
                  new Date(),
                  workspace.preferences.timezone,
                ),
              })
            }
          >
            {t("today")}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("next")}
            onClick={() => movePeriod(1)}
          >
            <ArrowRight />
          </Button>
        </div>
        <div className="hidden items-center rounded-lg border bg-background p-0.5 sm:flex">
          {(["week", "month", "agenda", "team"] as const).map((mode) => (
            <Button
              key={mode}
              variant={view === mode ? "secondary" : "ghost"}
              size="sm"
              aria-current={view === mode ? "page" : undefined}
              onClick={() => navigate({ view: mode })}
              className="inline-flex"
            >
              {t(mode)}
            </Button>
          ))}
        </div>
        <label className="sr-only" htmlFor="calendar-mobile-view">{t("view")}</label>
        <select
          id="calendar-mobile-view"
          value={view}
          className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm font-medium sm:hidden"
          onChange={(event) => navigate({ view: event.target.value as CalendarView })}
        >
          {(["week", "month", "agenda", "team"] as const).map((mode) => <option key={mode} value={mode}>{t(mode)}</option>)}
        </select>
        <Button variant="outline" className="h-11 px-3" disabled={!ownCalendarIds.length}
          aria-pressed={ownCalendarIds.length > 0 && filters.calendars.length === ownCalendarIds.length && ownCalendarIds.every((id) => filters.calendars.includes(id))}
          onClick={() => selectCalendars(filters.calendars.length === ownCalendarIds.length && ownCalendarIds.every((id) => filters.calendars.includes(id)) ? [] : ownCalendarIds)}>{t("myCalendars")}</Button>
        <Button
          variant="outline"
          className="h-11 px-3"
          aria-label={t("filters")}
          onClick={() => setFiltersOpen(true)}
        >
          <SlidersHorizontal className="size-4" />
          <span className="hidden sm:inline">{t("filters")}</span>
          {activeFilterCount > 0 ? <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] text-background">{activeFilterCount}</span> : null}
        </Button>
        <Button className="h-11 px-3" onClick={() => openNewEvent()} disabled={!defaultCalendarId} aria-label={t("newEvent")}>
          <Plus />
          <span className="hidden sm:inline">{t("newEvent")}</span>
        </Button>
      </div>
    </header>
  );
}
