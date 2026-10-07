"use client";

// Left calendar column on wide screens: search, mini month, calendar lists, colour toggle and
// saved views. Collapses to a slim rail (persisted per browser). Used by calendar-client.tsx.
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import type { CalendarView, CalendarWorkspace } from "../../../types";
import type { FilterState } from "../calendar-types";
import { MiniMonth } from "../mini-month";
import { CalendarListSection } from "./calendar-list-section";
import { CalendarSearchInput } from "./calendar-search-input";
import { CalendarColorsToggle } from "./calendar-colors-toggle";
import { SavedViewsSection } from "./saved-views-section";
import { savedViewFilters, type CalendarT } from "./sidebar-types";
import { useSidebarCollapsed } from "./use-sidebar-collapsed";
import type { CalendarFeeds } from "../use-calendar-feeds";

export function CalendarSidebar({
  t,
  locale,
  date,
  today,
  range,
  busyDays,
  workspace,
  filters,
  updateFilters,
  toggleFilter,
  selectCalendars,
  ownCalendarIds,
  showCalendarColors,
  setShowCalendarColors,
  navigate,
  saveView,
  openNewCalendar,
  openEditCalendar,
  feeds,
}: {
  t: CalendarT;
  locale: string;
  date: string;
  today: string;
  range: { from: string; to: string };
  busyDays?: Set<string>;
  workspace: CalendarWorkspace;
  filters: FilterState;
  updateFilters: (next: FilterState) => void;
  toggleFilter: (group: "sources" | "people" | "projects" | "calendars", value: string) => void;
  selectCalendars: (ids: string[]) => void;
  ownCalendarIds: string[];
  showCalendarColors: boolean;
  setShowCalendarColors: (value: boolean) => void;
  navigate: (next: { view?: CalendarView; date?: string; filters?: FilterState }) => void;
  saveView: () => void | Promise<void>;
  openNewCalendar: () => void;
  feeds: CalendarFeeds;
  openEditCalendar: (calendar: CalendarWorkspace["calendars"][number]) => void;
}) {
  const [collapsed, setCollapsed] = useSidebarCollapsed();

  if (collapsed) {
    return (
      <aside aria-label={t("sidebarLabel")} className="hidden w-11 shrink-0 flex-col items-center border-r pt-3 xl:flex" data-testid="calendar-sidebar">
        <ShortcutTooltip label={t("sidebarExpand")} hint={t("hintSidebarExpand")} side="right">
          <Button size="icon-sm" variant="ghost" aria-label={t("sidebarExpand")} aria-expanded={false} onClick={() => setCollapsed(false)}>
            <PanelLeftOpen />
          </Button>
        </ShortcutTooltip>
      </aside>
    );
  }

  return (
    <aside aria-label={t("sidebarLabel")} className="hidden w-60 shrink-0 flex-col border-r xl:flex" data-testid="calendar-sidebar">
      <div className="flex items-center gap-1 px-3 pt-3">
        <div className="min-w-0 flex-1">
          <CalendarSearchInput t={t} filters={filters} updateFilters={updateFilters} />
        </div>
        <ShortcutTooltip label={t("sidebarCollapse")} hint={t("hintSidebarCollapse")}>
          <Button size="icon-sm" variant="ghost" aria-label={t("sidebarCollapse")} aria-expanded onClick={() => setCollapsed(true)}>
            <PanelLeftClose />
          </Button>
        </ShortcutTooltip>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pt-3 pb-5">
        <MiniMonth
          t={t}
          className="w-full"
          date={date}
          today={today}
          locale={locale}
          range={range}
          busyDays={busyDays}
          weekStartsOn={workspace.preferences.weekStartsOn}
          onSelect={(nextDate) => navigate({ date: nextDate })}
        />
        <CalendarListSection
          dense
          t={t}
          workspace={workspace}
          filters={filters}
          ownCalendarIds={ownCalendarIds}
          toggleFilter={toggleFilter}
          selectCalendars={selectCalendars}
          openNewCalendar={openNewCalendar}
          openEditCalendar={openEditCalendar}
          feeds={feeds}
        />
        <CalendarColorsToggle t={t} checked={showCalendarColors} onChange={setShowCalendarColors} />
        <SavedViewsSection
          t={t}
          savedViews={workspace.savedViews}
          saveView={saveView}
          // The client re-syncs its filter state from the URL, so one navigation is enough.
          onApply={(saved) => navigate({ view: saved.view, filters: savedViewFilters(saved) })}
        />
      </div>
    </aside>
  );
}
