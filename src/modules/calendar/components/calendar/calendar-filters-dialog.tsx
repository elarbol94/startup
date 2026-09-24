"use client";

// Filters dialog: calendar selection, search, work sources, people, jump-to-date and saved views.
// Used by calendar-client.tsx.
import { useTranslations } from "next-intl";
import { Check, MoreHorizontal, Plus } from "lucide-react";
import { userIdentityColor } from "@/lib/user-mark-colors";
import { UserIdentity } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { CalendarView, CalendarWorkspace } from "../../types";
import { cn } from "@/lib/utils";
import type { FilterState } from "./calendar-types";
import { SOURCE_TYPES } from "./calendar-filter-utils";
import { MiniMonth } from "./mini-month";

export function CalendarFiltersDialog({
  filtersOpen,
  setFiltersOpen,
  t,
  locale,
  date,
  clientToday,
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
}: {
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  t: ReturnType<typeof useTranslations<"calendar">>;
  locale: string;
  date: string;
  clientToday: string | null;
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
  saveView: () => Promise<void>;
  openNewCalendar: () => void;
  openEditCalendar: (calendar: CalendarWorkspace["calendars"][number]) => void;
}) {
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
          <Input aria-label={t("searchPlaceholder")} value={filters.query} onChange={(event) => updateFilters({ ...filters, query: event.target.value })} placeholder={t("searchPlaceholder")} />
          <FilterGroup title={t("calendars")}>
            <div className="space-y-2">
              {workspace.calendars.map((calendar) => (
                <div key={calendar.id} className="flex items-center gap-2 rounded-lg border pr-2 transition-colors hover:bg-muted/40">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg px-3 py-3 focus-within:ring-2 focus-within:ring-ring">
                    <input type="checkbox" className="size-4 shrink-0 accent-foreground" aria-label={calendar.name} checked={!filters.calendars.length || filters.calendars.includes(calendar.id)} onChange={() => toggleFilter("calendars", calendar.id)} />
                    <span className="min-w-0 space-y-1">
                      <span className="block text-sm font-medium leading-snug">{calendar.name}</span>
                      <UserIdentity userId={calendar.ownerId} compact className="text-xs text-muted-foreground" />
                    </span>
                  </label>
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button size="icon-sm" variant="ghost" aria-label={t("calendarActions", { name: calendar.name })} />}><MoreHorizontal /></DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-48">
                      <DropdownMenuItem onClick={() => selectCalendars([calendar.id])}>{t("onlyCalendar", { name: calendar.name })}</DropdownMenuItem>
                      {calendar.role === "owner" && <DropdownMenuItem onClick={() => openEditCalendar(calendar)}>{t("editCalendar")}</DropdownMenuItem>}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          </FilterGroup>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" className="accent-foreground" checked={showCalendarColors} onChange={(event) => setShowCalendarColors(event.target.checked)} />{t("colorsByCalendar")}</label>
          {showCalendarColors && <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">{workspace.calendars.filter((calendar) => !filters.calendars.length || filters.calendars.includes(calendar.id)).map((calendar) => <span key={calendar.id} className="flex items-center gap-1"><span className="size-2 rounded-full" style={{backgroundColor:calendar.color}} />{calendar.name}</span>)}</div>}
          <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">{t("moreFilters")}</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <FilterGroup title={t("workSources")}>{SOURCE_TYPES.map((source) => <FilterToggle key={source} checked={visibleSources.has(source)} label={source === "event" ? t("events") : source === "focus" ? t("focus") : source === "deadline" ? t("deadlines") : source === "task" ? t("tasks") : t("projects")} color="var(--muted-foreground)" onChange={() => toggleFilter("sources", source)} />)}</FilterGroup>
              <FilterGroup title={t("people")}>{workspace.members.map((member) => <FilterToggle key={member.id} checked={filters.people.includes(member.id)} label={member.name} userId={member.id} color={userIdentityColor(member.id)} onChange={() => toggleFilter("people", member.id)} />)}</FilterGroup>
            </div>
          </details>
          <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">{t("jumpToDate")}</summary>
            <div className="mt-3"><MiniMonth date={date} today={clientToday} locale={locale} onSelect={(nextDate) => navigate({date:nextDate})} /></div>
          </details>
          <details className="border-t pt-3"><summary className="cursor-pointer text-sm font-medium">{t("savedViews")}</summary>
            <div className="mt-2 space-y-2">{workspace.savedViews.map((saved) => <Button key={saved.id} variant="ghost" size="sm" onClick={() => {const next = {sources:saved.filters.sources ?? [],people:saved.filters.people ?? [],projects:saved.filters.projects ?? [],calendars:saved.filters.calendars ?? [],query:saved.filters.query ?? ""};setFilters(next);navigate({view:saved.view,filters:next});setFiltersOpen(false);}}>{saved.name}</Button>)}
              <Button size="sm" variant="outline" onClick={() => void saveView()}>{t("saveView")}</Button>
            </div>
          </details>
        </div>
        <div className="flex shrink-0 justify-between border-t px-5 py-4 sm:px-6"><Button size="sm" variant="ghost" onClick={openNewCalendar}><Plus />{t("addCalendar")}</Button><Button size="sm" onClick={() => setFiltersOpen(false)}>{t("done")}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function FilterToggle({
  checked,
  label,
  color,
  onChange,
  detail,
  userId,
}: {
  checked: boolean;
  label: string;
  color: string;
  onChange: () => void;
  detail?: string;
  userId?: string;
}) {
  return (
    <label className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-muted focus-within:ring-2 focus-within:ring-ring">
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className={cn(
          "grid size-3.5 place-items-center rounded-[4px] border",
          checked && "text-white",
        )}
        style={{
          borderColor: color,
          backgroundColor: checked ? color : "transparent",
        }}
      >
        {checked && <Check className="size-2.5" />}
      </span>
      <span className="min-w-0 truncate">
        {userId ? <UserIdentity userId={userId} name={label} compact /> : <span className="block truncate">{label}</span>}
        {detail && (
          <span className="block truncate text-[10px] text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
    </label>
  );
}
