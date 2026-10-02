"use client";

// Calendar page client: wires the page hooks (URL state, dialogs, selection, time changes,
// shortcuts) to the toolbar, sidebar, active view, detail panel and dialogs from ./calendar/.
import { useMemo, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useTextPrompt } from "@/components/ui/text-prompt-dialog";
import { cn } from "@/lib/utils";
import { saveCalendarView } from "../preference-actions";
import { dateRange } from "../date-utils";
import type { CalendarView, CalendarWorkspace } from "../types";
import type { FilterState } from "./calendar/calendar-types";
import { busyDaysFor, periodLabel } from "./calendar/calendar-client-utils";
import { createCalendarDropHandlers } from "./calendar/calendar-drag-drop";
import { useCalendarConfirm } from "./calendar/use-calendar-confirm";
import { useCalendarFilteredItems } from "./calendar/use-calendar-filtered-items";
import { useCalendarNavigation } from "./calendar/use-calendar-navigation";
import { useCalendarReminderPolling } from "./calendar/use-calendar-reminders";
import { useCalendarSelection } from "./calendar/use-calendar-selection";
import { useCalendarSettingsState } from "./calendar/use-calendar-settings-state";
import { focusCalendarSearch, useCalendarShortcuts } from "./calendar/use-calendar-shortcuts";
import { useCalendarShowColors } from "./calendar/use-calendar-show-colors";
import { useCalendarToday } from "./calendar/use-calendar-today";
import { useEventDialogState } from "./calendar/use-event-dialog-state";
import { useEventTimeChange } from "./calendar/use-event-time-change";
import { CalendarToolbar } from "./calendar/calendar-toolbar";
import { CalendarSidebar } from "./calendar/sidebar/calendar-sidebar";
import { CalendarViewArea } from "./calendar/calendar-view-area";
import { CalendarDetailPanel } from "./calendar/calendar-detail-panel";
import { QuickCreatePopover } from "./calendar/quick-create/quick-create-popover";
import { CalendarFiltersDialog } from "./calendar/calendar-filters-dialog";
import { EventDialog } from "./calendar/event-dialog";
import { EventImportSection } from "./calendar/event-import-section";
import { CalendarSettingsDialog } from "./calendar/calendar-settings-dialog";

type QuickCreateSlot = { day: string; startMinutes: number; endMinutes: number; anchor: DOMRect };

export function CalendarClient({
  currentUser,
  workspace,
  view,
  viewWasExplicit,
  date,
  today: serverToday,
  range,
  initialFilters,
  openNewEvent: shouldOpenNewEvent = false,
  presetProjectId = null,
}: {
  currentUser: { id: string; name: string };
  workspace: CalendarWorkspace;
  view: CalendarView;
  viewWasExplicit: boolean;
  date: string;
  /** Today in the user's calendar timezone, computed on the server. */
  today: string;
  range: { from: string; to: string };
  initialFilters: FilterState;
  openNewEvent?: boolean;
  /** Project a new event opened from a project page starts linked to. */
  presetProjectId?: string | null;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const timezone = workspace.preferences.timezone;
  const [textPrompt, askText] = useTextPrompt();
  const [confirmDialog, confirm] = useCalendarConfirm();
  const [pending, startTransition] = useTransition();
  const today = useCalendarToday(serverToday, timezone);
  const nav = useCalendarNavigation({ view, viewWasExplicit, date, today, initialFilters, workspace });
  const { router, filters } = nav;
  const defaultCalendarId = workspace.calendars.find((calendar) => calendar.role === "owner")?.id
    ?? workspace.calendars.find((calendar) => calendar.role === "editor")?.id;
  const ownCalendarIds = workspace.calendars.filter((calendar) => calendar.role === "owner").map((calendar) => calendar.id);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [quickCreate, setQuickCreate] = useState<QuickCreateSlot | null>(null);
  const [showCalendarColors, setShowCalendarColors] = useCalendarShowColors();
  const { visibleSources, displayItems, filteredUnscheduledTasks } = useCalendarFilteredItems(workspace, filters, showCalendarColors);
  const days = useMemo(() => dateRange(range.from, range.to), [range.from, range.to]);
  const busyDays = useMemo(() => busyDaysFor(displayItems, range, timezone), [displayItems, range, timezone]);

  const events = useEventDialogState({
    workspace,
    date,
    defaultCalendarId,
    shouldOpenNewEvent,
    presetProjectId,
    projectFilter: filters.projects,
    onCloseRequestedNewEvent: () => router.replace(nav.buildUrl({})),
    noEditableCalendarMessage: t("noEditableCalendar"),
  });
  const settings = useCalendarSettingsState({ t, router, startTransition });
  const selection = useCalendarSelection({ items: workspace.items, t, router, confirm, openEditEvent: events.openEditEvent });
  const timeChange = useEventTimeChange({ t, router, confirm, openRecurring: events.openEditEvent });
  const { dropOnDay, dropOnTime } = createCalendarDropHandlers({ workspace, defaultCalendarId, router, t, setDraggingId, confirm });

  useCalendarReminderPolling(locale, t);
  useCalendarShortcuts({
    enabled: !events.eventOpen && !settings.calendarOpen && !filtersOpen,
    goToday: nav.goToday,
    movePeriod: nav.movePeriod,
    setView: (next) => nav.navigate({ view: next }),
    newEvent: () => events.openNewEvent(),
    focusSearch: () => {
      if (!focusCalendarSearch()) setFiltersOpen(true);
    },
    deselect: () => {
      setQuickCreate(null);
      selection.deselect();
    },
    canDeselect: Boolean(selection.selected || quickCreate),
    undo: timeChange.undoLast,
    canUndo: timeChange.canUndo,
    toggleHelp: () => setHelpOpen((open) => !open),
  });

  async function saveView() {
    const name = await askText({ title: t("saveView"), label: t("viewName"), required: true, maxLength: 100 });
    if (!name) return;
    await saveCalendarView({ name, view, filters });
    router.refresh();
    toast.success(t("viewSaved"));
  }

  const sharedFilterProps = {
    t,
    locale,
    date,
    range,
    busyDays,
    workspace,
    filters,
    updateFilters: nav.updateFilters,
    toggleFilter: nav.toggleFilter,
    selectCalendars: nav.selectCalendars,
    ownCalendarIds,
    showCalendarColors,
    setShowCalendarColors,
    navigate: nav.navigate,
    saveView,
    openNewCalendar: settings.openNewCalendar,
    openEditCalendar: settings.openEditCalendar,
  };

  return (
    <div className="mx-auto flex w-full max-w-[112rem] flex-col gap-4">
      <CalendarToolbar
        periodLabel={periodLabel(view, date, range, locale, t)}
        t={t}
        movePeriod={nav.movePeriod}
        goToday={nav.goToday}
        navigate={nav.navigate}
        view={view}
        ownCalendarIds={ownCalendarIds}
        filters={filters}
        selectCalendars={nav.selectCalendars}
        setFiltersOpen={setFiltersOpen}
        activeFilterCount={nav.activeFilterCount}
        openNewEvent={() => events.openNewEvent()}
        defaultCalendarId={defaultCalendarId}
        helpOpen={helpOpen}
        setHelpOpen={setHelpOpen}
      />

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="relative flex min-h-[44rem] min-w-0 rounded-2xl border bg-card xl:h-[calc(100dvh-9rem)]">
          {nav.navigating ? (
            <div role="status" aria-label={t("coreLoading")} className="pointer-events-none absolute inset-x-4 top-0 z-30 h-0.5 animate-pulse rounded-full bg-primary" />
          ) : null}
          <CalendarSidebar {...sharedFilterProps} today={today} />
          <div
            aria-busy={nav.navigating}
            className={cn("min-w-0 flex-1 transition-opacity duration-200 xl:overflow-y-auto", nav.navigating && "opacity-60")}
          >
            <CalendarViewArea
              view={view}
              days={days}
              date={date}
              today={today}
              items={displayItems}
              workspace={workspace}
              locale={locale}
              t={t}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              selectedId={selection.selectedId}
              onSelect={(item) => {
                setQuickCreate(null);
                selection.select(item);
              }}
              onDeselect={() => {
                setQuickCreate(null);
                selection.deselect();
              }}
              onCommit={timeChange.changeEventTime}
              onEdit={events.openEditEvent}
              onNew={(day, hour) => events.openNewEvent(day, hour)}
              onCreateRange={(day, startMinutes, endMinutes, anchor) => {
                selection.deselect();
                if (!defaultCalendarId) toast.error(t("noEditableCalendar"));
                else setQuickCreate({ day, startMinutes, endMinutes, anchor });
              }}
              onOpenDay={(day) => nav.navigate({ view: "day", date: day })}
              onDropDay={dropOnDay}
              onDropTime={dropOnTime}
            />
          </div>
        </div>

        <CalendarDetailPanel
          selected={selection.selected}
          workspace={workspace}
          unscheduledTasks={filteredUnscheduledTasks}
          locale={locale}
          t={t}
          router={router}
          setDraggingId={setDraggingId}
          onClose={selection.deselect}
          onEdit={events.openEditEvent}
          onDuplicate={events.openDuplicate}
          onDelete={(item) => void selection.deleteItem(item)}
        />
      </div>

      <QuickCreatePopover
        open={quickCreate !== null}
        anchor={quickCreate?.anchor ?? null}
        day={quickCreate?.day ?? date}
        startMinutes={quickCreate?.startMinutes ?? 540}
        endMinutes={quickCreate?.endMinutes ?? 600}
        calendars={workspace.calendars}
        defaultCalendarId={defaultCalendarId}
        timezone={timezone}
        locale={locale}
        t={t}
        onClose={() => setQuickCreate(null)}
        onCreated={() => setQuickCreate(null)}
        onMoreOptions={(draft) => {
          setQuickCreate(null);
          events.openFromQuickCreate(draft);
        }}
      />

      <CalendarFiltersDialog
        {...sharedFilterProps}
        filtersOpen={filtersOpen}
        setFiltersOpen={setFiltersOpen}
        clientToday={today}
        setFilters={nav.setFilters}
        visibleSources={visibleSources}
      />

      <EventDialog
        eventOpen={events.eventOpen}
        setEventOpen={events.setEventOpen}
        closeEventDialog={events.closeEventDialog}
        draft={events.draft}
        setDraft={events.setDraft}
        editDraft={events.editDraft}
        workspace={workspace}
        currentUser={currentUser}
        conflicts={events.conflicts}
        setConflicts={events.setConflicts}
        setSelected={selection.setSelected}
        pending={pending}
        startTransition={startTransition}
        locale={locale}
        t={t}
        router={router}
        importSection={<EventImportSection {...events.importState} t={t} />}
      />
      <CalendarSettingsDialog
        open={settings.calendarOpen}
        onOpenChange={settings.setCalendarOpen}
        draft={settings.calendarDraft}
        setDraft={settings.setCalendarDraft}
        onSubmit={settings.submitCalendar}
        pending={pending}
        t={t}
      />
      {confirmDialog}
      {textPrompt}
    </div>
  );
}
