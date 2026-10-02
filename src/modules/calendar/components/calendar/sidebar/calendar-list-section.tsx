"use client";

// "My calendars" / "Other calendars" lists with visibility checkboxes and an add button.
// Used by calendar-sidebar.tsx and calendar-filters-dialog.tsx.
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShortcutTooltip } from "@/components/ui/shortcut-tooltip";
import type { CalendarWorkspace } from "../../../types";
import type { FilterState } from "../calendar-types";
import { CalendarRow } from "./calendar-row";
import { isCalendarShown, type CalendarEntry, type CalendarT } from "./sidebar-types";
import { SidebarSection } from "./sidebar-section";

export function CalendarListSection({
  t,
  workspace,
  filters,
  ownCalendarIds,
  toggleFilter,
  selectCalendars,
  openNewCalendar,
  openEditCalendar,
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
              />
            ))}
          </div>
        </SidebarSection>
      ))}
      {openNewCalendar && (
        <ShortcutTooltip label={t("addCalendar")} hint={t("hintAddCalendar")} side="right">
          <Button size="sm" variant="ghost" className="w-full justify-start text-muted-foreground" onClick={openNewCalendar}>
            <Plus />
            {t("addCalendar")}
          </Button>
        </ShortcutTooltip>
      )}
    </div>
  );
}
