"use client";

// Filters dialog for small screens and advanced filters: calendars, search, people and work
// sources, jump-to-date and saved views. Calendar list, search, mini month, colour toggle and
// saved views are the same components the wide-screen sidebar uses. Used by calendar-client.tsx.
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { userIdentityColor } from "@/lib/user-mark-colors";
import { UserIdentity } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { CalendarView, CalendarWorkspace } from "../../types";
import { cn } from "@/lib/utils";
import type { FilterState } from "./calendar-types";
import { SOURCE_TYPES } from "./calendar-filter-utils";
import { MiniMonth } from "./mini-month";
import { AddCalendarMenu, CalendarListSection } from "./sidebar/calendar-list-section";
import type { CalendarFeeds } from "./use-calendar-feeds";
import { CalendarSearchInput } from "./sidebar/calendar-search-input";
import { CalendarColorsToggle } from "./sidebar/calendar-colors-toggle";
import { SavedViewsSection } from "./sidebar/saved-views-section";
import { SidebarSection } from "./sidebar/sidebar-section";
import { isCalendarShown, savedViewFilters } from "./sidebar/sidebar-types";

export function CalendarFiltersDialog({
  filtersOpen,
  setFiltersOpen,
  t,
  locale,
  date,
  clientToday,
  range,
  busyDays,
  workspace,
  filters,
  setFilters,
  updateFilters,
  toggleFilter,
  selectCalendars,
  ownCalendarIds,
  showCalendarColors,
  setShowCalendarColors,
  visibleSources,
  navigate,
  saveView,
  openNewCalendar,
  openEditCalendar,
  feeds,
}: {
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  t: ReturnType<typeof useTranslations<"calendar">>;
  locale: string;
  date: string;
  clientToday: string | null;
  /** Optional: shown range (exclusive `to`) and busy days for the jump-to-date mini month. */
  range?: { from: string; to: string };
  busyDays?: Set<string>;
  workspace: CalendarWorkspace;
  filters: FilterState;
  setFilters: (filters: FilterState) => void;
  updateFilters: (next: FilterState) => void;
  toggleFilter: (
    group: "sources" | "people" | "projects" | "calendars",
    value: string,
  ) => void;
  selectCalendars: (ids: string[]) => void;
  ownCalendarIds: string[];
  showCalendarColors: boolean;
  setShowCalendarColors: (show: boolean) => void;
  visibleSources: Set<string>;
  navigate: (next: { view?: CalendarView; date?: string; filters?: FilterState }) => void;
  saveView: () => void | Promise<void>;
  openNewCalendar: () => void;
  feeds: CalendarFeeds;
  openEditCalendar: (calendar: CalendarWorkspace["calendars"][number]) => void;
}) {
  const sourceLabel = (source: string) =>
    source === "event" ? t("events") : source === "focus" ? t("focus") : source === "deadline" ? t("deadlines") : source === "task" ? t("tasks") : t("projects");
  return (
    <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 px-5 pt-5 pb-4 sm:px-6">
          <DialogTitle>{t("filters")}</DialogTitle>
          <DialogDescription>{t("compactFilterHint")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto px-5 pb-5 sm:px-6" data-testid="calendar-mobile-filters">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => selectCalendars([])}>{t("allCalendars")}</Button>
            <Button size="sm" variant="outline" disabled={!ownCalendarIds.length} onClick={() => selectCalendars(ownCalendarIds)}>{t("myCalendars")}</Button>
          </div>
          <CalendarSearchInput t={t} filters={filters} updateFilters={updateFilters} />
          <CalendarListSection
            feeds={feeds}
            t={t}
            workspace={workspace}
            filters={filters}
            ownCalendarIds={ownCalendarIds}
            toggleFilter={toggleFilter}
            selectCalendars={selectCalendars}
            openEditCalendar={openEditCalendar}
          />
          <div className="space-y-1">
            <CalendarColorsToggle t={t} checked={showCalendarColors} onChange={setShowCalendarColors} />
            {showCalendarColors && (
              <div className="flex flex-wrap gap-x-3 gap-y-1 px-2 text-xs text-muted-foreground">
                {workspace.calendars.filter((calendar) => isCalendarShown(filters, calendar.id)).map((calendar) => (
                  <span key={calendar.id} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{ backgroundColor: calendar.color }} />{calendar.name}</span>
                ))}
              </div>
            )}
          </div>
          <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">{t("moreFilters")}</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <SidebarSection title={t("workSources")}>
                <div className="space-y-0.5">{SOURCE_TYPES.map((source) => <FilterToggle key={source} checked={visibleSources.has(source)} label={sourceLabel(source)} color="var(--muted-foreground)" onChange={() => toggleFilter("sources", source)} />)}</div>
              </SidebarSection>
              <SidebarSection title={t("people")}>
                <div className="space-y-0.5">{workspace.members.map((member) => <FilterToggle key={member.id} checked={filters.people.includes(member.id)} label={member.name} userId={member.id} color={userIdentityColor(member.id)} onChange={() => toggleFilter("people", member.id)} />)}</div>
              </SidebarSection>
            </div>
          </details>
          <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">{t("jumpToDate")}</summary>
            <div className="mt-3"><MiniMonth t={t} date={date} today={clientToday} locale={locale} range={range} busyDays={busyDays} weekStartsOn={workspace.preferences.weekStartsOn} onSelect={(nextDate) => navigate({ date: nextDate })} /></div>
          </details>
          <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">{t("savedViews")}</summary>
            <div className="mt-2">
              <SavedViewsSection
                hideTitle
                saveLabel={t("saveView")}
                t={t}
                savedViews={workspace.savedViews}
                saveView={saveView}
                onApply={(saved) => {
                  const next = savedViewFilters(saved);
                  setFilters(next);
                  navigate({ view: saved.view, filters: next });
                  setFiltersOpen(false);
                }}
              />
            </div>
          </details>
        </div>
        <div className="flex shrink-0 justify-between border-t px-5 py-4 sm:px-6"><AddCalendarMenu t={t} feeds={feeds} openNewCalendar={openNewCalendar} /><Button size="sm" onClick={() => setFiltersOpen(false)}>{t("done")}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function FilterToggle({
  checked,
  label,
  color,
  onChange,
  userId,
}: {
  checked: boolean;
  label: string;
  color: string;
  onChange: () => void;
  userId?: string;
}) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
      <input type="checkbox" aria-label={label} checked={checked} onChange={onChange} className="sr-only" />
      <span
        className={cn("grid size-3.5 place-items-center rounded-[4px] border", checked && "text-white")}
        style={{ borderColor: color, backgroundColor: checked ? color : "transparent" }}
      >
        {checked && <Check className="size-2.5" />}
      </span>
      <span className="min-w-0 truncate">
        {userId ? <UserIdentity userId={userId} name={label} compact /> : <span className="block truncate">{label}</span>}
      </span>
    </label>
  );
}
