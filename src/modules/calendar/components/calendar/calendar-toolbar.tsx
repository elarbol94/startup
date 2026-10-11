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

// Design 1b segmented control look (matches @/components/ui/segmented-control). The calendar keeps
// plain buttons here because the view switch is navigation, not a radio choice.
const SEGMENT = "inline-flex shrink-0 items-center gap-0.5 rounded-[10px] border bg-muted p-[3px]";
const SEGMENT_BUTTON =
  "inline-flex h-[26px] items-center justify-center gap-1.5 rounded-[7px] px-2.5 text-[12.5px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-sm:h-9 [&_svg]:size-3.5";
const SEGMENT_ACTIVE = "bg-card text-foreground shadow-sm dark:bg-secondary dark:shadow-none";
const CONTROL_HEIGHT = "max-sm:h-10 max-sm:px-3";

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
    <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-x-6">
      <h1 className="min-w-0 text-[22px] leading-[1.2] font-semibold tracking-[-0.025em] text-foreground sm:text-[26px]">{periodLabel}</h1>
      <div className="flex flex-wrap items-center gap-2 max-sm:w-full sm:justify-end">
        <div className={SEGMENT}>
          <ShortcutTooltip label={t("previous")} keys={<CalendarShortcutKeys shortcuts={[KEYS.previous]} />} hint={t("hintPrevious")}>
            <button type="button" aria-label={t("previous")} onClick={() => movePeriod(-1)} className={cn(SEGMENT_BUTTON, "px-2 max-sm:w-10")}>
              <ArrowLeft />
            </button>
          </ShortcutTooltip>
          <ShortcutTooltip label={t("shortcutToday")} shortcut={KEYS.today} hint={t("hintToday")}>
            <button type="button" onClick={goToday} className={SEGMENT_BUTTON}>
              {t("today")}
            </button>
          </ShortcutTooltip>
          <ShortcutTooltip label={t("next")} keys={<CalendarShortcutKeys shortcuts={[KEYS.next]} />} hint={t("hintNext")}>
            <button type="button" aria-label={t("next")} onClick={() => movePeriod(1)} className={cn(SEGMENT_BUTTON, "px-2 max-sm:w-10")}>
              <ArrowRight />
            </button>
          </ShortcutTooltip>
        </div>
        <div role="group" aria-label={t("coreViewSwitcher")} className={cn(SEGMENT, "max-sm:hidden")}>
          {CALENDAR_VIEWS.map((mode) => (
            <ShortcutTooltip key={mode} label={t(CALENDAR_VIEW_LABELS[mode])} shortcut={CALENDAR_VIEW_SHORTCUTS[mode]} hint={t(VIEW_HINTS[mode])}>
              <button
                type="button"
                aria-current={view === mode ? "page" : undefined}
                data-active={view === mode || undefined}
                onClick={() => navigate({ view: mode })}
                className={cn(SEGMENT_BUTTON, view === mode && SEGMENT_ACTIVE)}
              >
                {mode === "workweek" ? t("coreViewWorkweekShort") : t(CALENDAR_VIEW_LABELS[mode])}
              </button>
            </ShortcutTooltip>
          ))}
        </div>
        <label className="sr-only" htmlFor="calendar-mobile-view">{t("view")}</label>
        <select
          id="calendar-mobile-view"
          value={view}
          className="h-10 min-w-[7.5rem] flex-1 rounded-lg border bg-card px-3 text-[13.5px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
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
            className={cn("flex-1 sm:flex-none", CONTROL_HEIGHT, onlyOwnCalendars && "border-brand/40 bg-brand-soft text-brand-ink hover:bg-brand-soft")}
            disabled={!ownCalendarIds.length}
            aria-pressed={onlyOwnCalendars}
            onClick={() => selectCalendars(onlyOwnCalendars ? [] : ownCalendarIds)}
          >
            {t("myCalendars")}
          </Button>
        </ShortcutTooltip>
        <ShortcutTooltip label={t("filters")} hint={t("hintFilters")}>
          <Button variant="outline" className={CONTROL_HEIGHT} aria-label={t("filters")} onClick={() => setFiltersOpen(true)}>
            <SlidersHorizontal />
            <span className="hidden sm:inline">{t("filters")}</span>
            {activeFilterCount > 0 ? (
              <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand-soft px-1 text-[11px] font-semibold tabular-nums text-brand-ink">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </ShortcutTooltip>
        <CalendarShortcutsHelp open={helpOpen} onOpenChange={setHelpOpen} t={t} />
        <ShortcutTooltip label={t("newEvent")} shortcut={KEYS.newEvent} hint={t("hintNewEvent")}>
          <Button className={CONTROL_HEIGHT} onClick={() => openNewEvent()} disabled={!defaultCalendarId} aria-label={t("newEvent")}>
            <Plus />
            <span className="hidden sm:inline">{t("newEvent")}</span>
          </Button>
        </ShortcutTooltip>
      </div>
    </header>
  );
}
