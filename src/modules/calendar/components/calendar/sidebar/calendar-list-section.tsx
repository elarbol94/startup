"use client";

// "My calendars" / "Other calendars" lists with visibility checkboxes and an add menu
// (new calendar, Google Calendar subscription, file import).
// Used by calendar-sidebar.tsx and calendar-filters-dialog.tsx.
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import { cn } from "@/lib/utils";
import type { CalendarWorkspace } from "../../../types";
import type { FilterState } from "../calendar-types";
import { CalendarRow } from "./calendar-row";
import { isCalendarShown, type CalendarEntry, type CalendarT } from "./sidebar-types";
import { SidebarSection } from "./sidebar-section";
import type { CalendarFeeds } from "../use-calendar-feeds";

/** "Add calendar" with the choice of a new, subscribed or imported calendar. */
export function AddCalendarMenu({
  t,
  feeds,
  openNewCalendar,
  className,
}: {
  t: CalendarT;
  feeds: CalendarFeeds;
  openNewCalendar: () => void;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <ShortcutTooltip label={t("addCalendar")} hint={t("hintAddCalendar")} side="right">
        <DropdownMenuTrigger render={<Button size="sm" variant="ghost" className={cn("text-muted-foreground", className)} />}>
          <Plus />
          {t("addCalendar")}
          <ChevronDown className="ml-auto" />
        </DropdownMenuTrigger>
      </ShortcutTooltip>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem onClick={openNewCalendar}>{t("feeds.newCalendar")}</DropdownMenuItem>
        <DropdownMenuItem onClick={feeds.openSubscribe}>{t("feeds.subscribe")}</DropdownMenuItem>
        <DropdownMenuItem disabled={!feeds.canImport} onClick={feeds.openImport}>{t("feeds.import")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CalendarListSection({
  t,
  workspace,
  filters,
  ownCalendarIds,
  toggleFilter,
  selectCalendars,
  openNewCalendar,
  openEditCalendar,
  feeds,
  dense,
}: {
  t: CalendarT;
  workspace: CalendarWorkspace;
  filters: FilterState;
  ownCalendarIds: string[];
  toggleFilter: (group: "sources" | "people" | "projects" | "calendars", value: string) => void;
  selectCalendars: (ids: string[]) => void;
  openNewCalendar?: () => void;
  openEditCalendar: (calendar: CalendarEntry) => void;
  feeds: CalendarFeeds;
  /** Compact sidebar rows instead of the bordered dialog rows. */
  dense?: boolean;
}) {
  const own = workspace.calendars.filter((calendar) => ownCalendarIds.includes(calendar.id));
  const others = workspace.calendars.filter((calendar) => !ownCalendarIds.includes(calendar.id));
  const groups = [
    { key: "own", title: t("myCalendars"), calendars: own },
    { key: "others", title: t("sidebarOtherCalendars"), calendars: others },
  ].filter((group) => group.calendars.length);
  return (
    <div className="space-y-4">
      {groups.map((group, index) => (
        <SidebarSection
          key={group.key}
          title={group.title}
          action={
            index === 0 && filters.calendars.length > 0 ? (
              <button type="button" className="rounded text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" onClick={() => selectCalendars([])}>
                {t("sidebarShowAll")}
              </button>
            ) : undefined
          }
        >
          <div className={dense ? "space-y-px" : "space-y-2"}>
            {group.calendars.map((calendar) => (
              <CalendarRow
                key={calendar.id}
                t={t}
                calendar={calendar}
                dense={dense}
                showOwner={!dense}
                checked={isCalendarShown(filters, calendar.id)}
                onToggle={() => toggleFilter("calendars", calendar.id)}
                onOnly={() => selectCalendars([calendar.id])}
                onEdit={() => openEditCalendar(calendar)}
                onSync={() => void feeds.syncNow(calendar)}
                onRemove={() => void feeds.remove(calendar)}
              />
            ))}
          </div>
        </SidebarSection>
      ))}
      {openNewCalendar && (
        <AddCalendarMenu t={t} feeds={feeds} openNewCalendar={openNewCalendar} className="w-full justify-start" />
      )}
    </div>
  );
}
