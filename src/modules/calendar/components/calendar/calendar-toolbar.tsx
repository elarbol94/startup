"use client";

// Calendar page header: period label, period navigation, view switcher, "my calendars", filter,
// shortcut help and new-event buttons, with keyboard hints in the tooltips.
// Used by calendar-client.tsx.
import { useTranslations } from "next-intl";
import { ArrowLeft, ArrowRight, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { cn } from "@/lib/utils";
import type { CalendarView } from "../../types";
import {
  CALENDAR_VIEW_LABELS,
  CALENDAR_VIEWS,
  MOBILE_VIEW_STORAGE_KEY,
  type CalendarNavigateTarget,
  type FilterState,
} from "./calendar-types";
import { CalendarShortcutKeys, CalendarShortcutsHelp } from "./calendar-shortcuts-help";
import { CALENDAR_PAGE_SHORTCUTS as KEYS } from "@/lib/app-shortcuts";
import { CALENDAR_VIEW_SHORTCUTS } from "./use-calendar-shortcuts";

const VIEW_HINTS = {
  day: "hintViewDay",
  workweek: "hintViewWorkweek",
  week: "hintViewWeek",
  month: "hintViewMonth",
  agenda: "hintViewAgenda",
  team: "hintViewTeam",
} as const satisfies Record<CalendarView, string>;

export function CalendarToolbar({
  periodLabel,
  t,
  movePeriod,
  goToday,
  navigate,
  view,
  ownCalendarIds,
  filters,
  selectCalendars,
  setFiltersOpen,
  activeFilterCount,
  openNewEvent,
  defaultCalendarId,
  helpOpen,
  setHelpOpen,
}: {
  periodLabel: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  movePeriod: (direction: number) => void;
  goToday: () => void;
  navigate: (next: CalendarNavigateTarget) => void;
  view: CalendarView;
  ownCalendarIds: string[];
  filters: FilterState;
  selectCalendars: (ids: string[]) => void;
  setFiltersOpen: (open: boolean) => void;
  activeFilterCount: number;
  openNewEvent: () => void;
  defaultCalendarId: string | undefined;
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
}) {
  const onlyOwnCalendars =
    ownCalendarIds.length > 0 &&
    filters.calendars.length === ownCalendarIds.length &&
    ownCalendarIds.every((id) => filters.calendars.includes(id));
  return (
    <header className="flex flex-col gap-3 2xl:flex-row 2xl:items-end 2xl:justify-between">
      <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{periodLabel}</h1>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-h-11 items-center rounded-lg border bg-background p-0.5">
          <ShortcutTooltip label={t("previous")} keys={<CalendarShortcutKeys shortcuts={[KEYS.previous]} />} hint={t("hintPrevious")}>
            <Button variant="ghost" size="icon-sm" aria-label={t("previous")} onClick={() => movePeriod(-1)}>
              <ArrowLeft />
            </Button>
          </ShortcutTooltip>
          <ShortcutTooltip label={t("shortcutToday")} shortcut={KEYS.today} hint={t("hintToday")}>
            <Button variant="ghost" size="sm" onClick={goToday}>
              {t("today")}
            </Button>
          </ShortcutTooltip>
          <ShortcutTooltip label={t("next")} keys={<CalendarShortcutKeys shortcuts={[KEYS.next]} />} hint={t("hintNext")}>
            <Button variant="ghost" size="icon-sm" aria-label={t("next")} onClick={() => movePeriod(1)}>
              <ArrowRight />
            </Button>
          </ShortcutTooltip>
        </div>
        <div
          role="group"
          aria-label={t("coreViewSwitcher")}
          className="hidden min-h-11 items-center rounded-lg border bg-background p-0.5 sm:flex"
        >
          {CALENDAR_VIEWS.map((mode) => (
            <ShortcutTooltip key={mode} label={t(CALENDAR_VIEW_LABELS[mode])} shortcut={CALENDAR_VIEW_SHORTCUTS[mode]} hint={t(VIEW_HINTS[mode])}>
              <Button
                variant={view === mode ? "secondary" : "ghost"}
                size="sm"
                aria-current={view === mode ? "page" : undefined}
                onClick={() => navigate({ view: mode })}
                className={cn("inline-flex px-2.5", view === mode && "shadow-xs")}
              >
                {mode === "workweek" ? t("coreViewWorkweekShort") : t(CALENDAR_VIEW_LABELS[mode])}
              </Button>
            </ShortcutTooltip>
          ))}
        </div>
        <label className="sr-only" htmlFor="calendar-mobile-view">{t("view")}</label>
        <select
          id="calendar-mobile-view"
          value={view}
          className="h-11 min-w-[7.5rem] flex-1 rounded-lg border bg-background px-3 text-sm font-medium sm:hidden"
          onChange={(event) => {
            const next = event.target.value as CalendarView;
            try {
              window.localStorage.setItem(MOBILE_VIEW_STORAGE_KEY, next);
            } catch {}
            navigate({ view: next });
          }}
        >
          {CALENDAR_VIEWS.map((mode) => (
            <option key={mode} value={mode}>
              {t(CALENDAR_VIEW_LABELS[mode])}
            </option>
          ))}
        </select>
        <ShortcutTooltip label={t("myCalendars")} hint={t("hintMyCalendars")}>
          <Button
            variant="outline"
            className="h-11 flex-1 px-3 sm:flex-none"
            disabled={!ownCalendarIds.length}
            aria-pressed={onlyOwnCalendars}
            onClick={() => selectCalendars(onlyOwnCalendars ? [] : ownCalendarIds)}
          >
            {t("myCalendars")}
          </Button>
        </ShortcutTooltip>
        <ShortcutTooltip label={t("filters")} hint={t("hintFilters")}>
          <Button variant="outline" className="h-11 px-3" aria-label={t("filters")} onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal className="size-4" />
            <span className="hidden sm:inline">{t("filters")}</span>
            {activeFilterCount > 0 ? (
              <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[10px] text-background">{activeFilterCount}</span>
            ) : null}
          </Button>
        </ShortcutTooltip>
        <CalendarShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} t={t} />
        <ShortcutTooltip label={t("newEvent")} shortcut={KEYS.newEvent} hint={t("hintNewEvent")}>
          <Button className="h-11 px-3" onClick={() => openNewEvent()} disabled={!defaultCalendarId} aria-label={t("newEvent")}>
            <Plus />
            <span className="hidden sm:inline">{t("newEvent")}</span>
          </Button>
        </ShortcutTooltip>
      </div>
    </header>
  );
}
