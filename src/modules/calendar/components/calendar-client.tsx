"use client";

// Calendar page client: owns page state (filters, drafts, dialogs, selection) and assembles
// the toolbar, views, side panel and dialogs from ./calendar/.
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { MobileBottomSheet } from "@/components/ui/mobile-bottom-sheet";
import { moveCalendarEvent } from "../actions";
import {
  createCalendar,
  updateCalendar,
} from "../calendar-management-actions";
import { saveCalendarView } from "../preference-actions";
import {
  addDays,
  dateRange,
  daysBetween,
  isoDate,
  localDateInZone,
  parseDate,
} from "../date-utils";
import type {
  CalendarItem,
  CalendarView,
  CalendarWorkspace,
} from "../types";
import { cn } from "@/lib/utils";
import { canonicalTaskHref } from "@/modules/context/routes";
import type {
  CalendarDraft,
  EventDraft,
  FilterState,
  ImportableDraftField,
} from "./calendar/calendar-types";
import { SOURCE_TYPES } from "./calendar/calendar-filter-utils";
import { blankDraft, itemDraft } from "./calendar/event-draft-utils";
import { useCalendarFilteredItems } from "./calendar/use-calendar-filtered-items";
import { useCalendarReminderPolling } from "./calendar/use-calendar-reminders";
import { createCalendarDropHandlers, dragPayload } from "./calendar/calendar-drag-drop";
import { CalendarToolbar } from "./calendar/calendar-toolbar";
import { FlowWeek } from "./calendar/flow-week";
import { MonthView } from "./calendar/month-view";
import { AgendaView } from "./calendar/agenda-view";
import { TeamView } from "./calendar/team-view";
import { Inspector } from "./calendar/inspector";
import { UnscheduledTray } from "./calendar/unscheduled-tray";
import { CalendarFiltersDialog } from "./calendar/calendar-filters-dialog";
import { EventDialog } from "./calendar/event-dialog";
import { EventImportSection } from "./calendar/event-import-section";
import { CalendarSettingsDialog } from "./calendar/calendar-settings-dialog";

const subscribeToClock = (onStoreChange: () => void) => {
  const timer = window.setInterval(onStoreChange, 60_000);
  return () => window.clearInterval(timer);
};

export function CalendarClient({
  currentUser,
  workspace,
  view,
  viewWasExplicit,
  date,
  range,
  initialFilters,
  openNewEvent: shouldOpenNewEvent = false,
}: {
  currentUser: { id: string; name: string };
  workspace: CalendarWorkspace;
  view: CalendarView;
  viewWasExplicit: boolean;
  date: string;
  range: { from: string; to: string };
  initialFilters: FilterState;
  openNewEvent?: boolean;
}) {
  const t = useTranslations("calendar");
  const locale = useLocale();
  const router = useRouter();
  const defaultCalendarId = workspace.calendars.find((calendar) => calendar.role === "owner")?.id
    ?? workspace.calendars.find((calendar) => calendar.role === "editor")?.id;
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useState<FilterState>(initialFilters);
  const incomingFilterKey = JSON.stringify(initialFilters);
  const [syncedFilterKey, setSyncedFilterKey] = useState(incomingFilterKey);
  if (syncedFilterKey !== incomingFilterKey) {
    setSyncedFilterKey(incomingFilterKey);
    setFilters(initialFilters);
  }
  const [eventOpen, setEventOpen] = useState(shouldOpenNewEvent);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showCalendarColors, setShowCalendarColors] = useState(false);
  const [calendarDraft, setCalendarDraft] = useState<CalendarDraft>({
    name: "",
    color: "#6D5EF7",
    visibility: "private",
  });
  const importFileInput = useRef<HTMLInputElement>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<{
    label: string;
    fields: string[];
    method: "ai" | "parser";
  } | null>(null);
  const [manuallyEditedFields, setManuallyEditedFields] = useState<
    Set<ImportableDraftField>
  >(() => new Set());
  const [draft, setDraft] = useState<EventDraft>(() =>
    blankDraft(
      defaultCalendarId ?? "",
      workspace.preferences.timezone,
      date,
    ),
  );
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [conflicts, setConflicts] = useState<
    { id: string; title: string; startAt: string; endAt: string }[]
  >([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const clientToday = useSyncExternalStore(
    subscribeToClock,
    () =>
      localDateInZone(
        new Date(),
        workspace.preferences.timezone,
      ),
    () => null,
  );
  useEffect(() => {
    if (viewWasExplicit || view === "agenda") return;
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    const params = new URLSearchParams(window.location.search);
    params.set("view", "agenda");
    params.set("date", date);
    router.replace(`/calendar?${params.toString()}`);
  }, [date, router, view, viewWasExplicit]);
  const { visibleSources, displayItems, filteredUnscheduledTasks } = useCalendarFilteredItems(
    workspace,
    filters,
    showCalendarColors,
  );
  const ownCalendarIds = workspace.calendars.filter((calendar) => calendar.role === "owner").map((calendar) => calendar.id);
  function selectCalendars(ids: string[]) {
    updateFilters({ sources: [], people: [], projects: [], calendars: ids, query: "" });
  }


  const days = useMemo(
    () => dateRange(range.from, range.to),
    [range.from, range.to],
  );
  const weekDays = days.slice(0, 7);

  useCalendarReminderPolling(locale, t);

  const previousOpenNewEvent = useRef(shouldOpenNewEvent);
  useEffect(() => {
    const wasRequested = previousOpenNewEvent.current;
    previousOpenNewEvent.current = shouldOpenNewEvent;
    if (!shouldOpenNewEvent || wasRequested || !defaultCalendarId) return;
    setConflicts([]);
    setDraft(
      blankDraft(
        defaultCalendarId,
        workspace.preferences.timezone,
        date,
      ),
    );
    setImportUrl("");
    setImportBusy(false);
    setImportError("");
    setImportResult(null);
    setManuallyEditedFields(new Set());
    setEventOpen(true);
  }, [
    date,
    defaultCalendarId,
    shouldOpenNewEvent,
    workspace.preferences.timezone,
  ]);

  function buildUrl(next: {
    view?: CalendarView;
    date?: string;
    filters?: FilterState;
  }) {
    const params = new URLSearchParams();
    params.set("view", next.view ?? view);
    params.set("date", next.date ?? date);
    const values = next.filters ?? filters;
    if (values.sources.length > 0) params.set("sources", values.sources.join(","));
    if (values.people.length > 0) params.set("people", values.people.join(","));
    if (values.projects.length > 0)
      params.set("projects", values.projects.join(","));
    if (values.calendars.length > 0)
      params.set("calendars", values.calendars.join(","));
    if (values.query) params.set("query", values.query);
    return `/calendar?${params.toString()}`;
  }

  function navigate(next: {
    view?: CalendarView;
    date?: string;
    filters?: FilterState;
  }) {
    router.push(buildUrl(next));
  }

  function closeEventDialog() {
    setEventOpen(false);
    if (shouldOpenNewEvent) router.replace(buildUrl({}));
  }

  function resetImport() {
    setImportUrl("");
    setImportBusy(false);
    setImportError("");
    setImportResult(null);
    setManuallyEditedFields(new Set());
  }

  function editDraft<K extends ImportableDraftField>(
    field: K,
    value: EventDraft[K],
  ) {
    setDraft((current) => {
      const next = { ...current, [field]: value };
      if (field === "startDate") {
        next.endDate = addDays(String(value), Math.max(current.allDay ? 1 : 0, daysBetween(current.startDate, current.endDate)));
      }
      if (field === "allDay") {
        next.endDate = addDays(current.endDate, value ? 1 : -1);
        if (next.endDate < next.startDate) next.endDate = next.startDate;
      }
      return next;
    });
    setManuallyEditedFields((current) => new Set(current).add(field));
  }

  function updateFilters(next: FilterState) {
    setFilters(next);
    router.replace(buildUrl({ filters: next }));
  }

  function toggleFilter(
    group: "sources" | "people" | "projects" | "calendars",
    value: string,
  ) {
    const current =
      group === "sources" && filters.sources.length === 0
        ? [...SOURCE_TYPES]
        : group === "calendars" && filters.calendars.length === 0
          ? workspace.calendars.map((calendar) => calendar.id)
          : filters[group];
    const values = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    updateFilters({ ...filters, [group]: values.length === 0 && (group === "sources" || group === "calendars") ? ["__none__"] : values.filter((id) => id !== "__none__") });
  }

  function movePeriod(direction: number) {
    if (view === "month") {
      const current = parseDate(date);
      navigate({
        date: isoDate(
          new Date(
            Date.UTC(
              current.getUTCFullYear(),
              current.getUTCMonth() + direction,
              1,
            ),
          ),
        ),
      });
      return;
    }
    const amount = view === "agenda" ? 30 : 7;
    navigate({ date: addDays(date, amount * direction) });
  }

  function openNewEvent(day = date, hour = 9) {
    if (!defaultCalendarId) {
      toast.error(t("noEditableCalendar"));
      return;
    }
    setConflicts([]);
    setDraft(
      blankDraft(
        defaultCalendarId,
        workspace.preferences.timezone,
        day,
        hour,
      ),
    );
    resetImport();
    setEventOpen(true);
  }

  function openNewCalendar() {
    setCalendarDraft({ name: "", color: "#6D5EF7", visibility: "private" });
    setCalendarOpen(true);
  }

  function openEditCalendar(calendar: CalendarWorkspace["calendars"][number]) {
    setCalendarDraft({
      id: calendar.id,
      name: calendar.name,
      color: calendar.color,
      visibility: calendar.visibility,
    });
    setCalendarOpen(true);
  }

  function submitCalendar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => {
      void (calendarDraft.id
        ? updateCalendar({
            calendarId: calendarDraft.id,
            name: calendarDraft.name,
            color: calendarDraft.color,
            visibility: calendarDraft.visibility,
          })
        : createCalendar({
            name: calendarDraft.name,
            color: calendarDraft.color,
            visibility: calendarDraft.visibility,
          })
      )
        .then(() => {
          setCalendarOpen(false);
          router.refresh();
        })
        .catch(() => toast.error(t("calendarSaveError")));
    });
  }

  function openEditEvent(item: CalendarItem) {
    if (item.kind !== "event" && item.kind !== "focus") return;
    setConflicts([]);
    setDraft(
      itemDraft(
        item,
        defaultCalendarId ?? "",
        workspace.preferences.timezone,
      ),
    );
    resetImport();
    setEventOpen(true);
  }

  const { dropOnDay, dropOnTime } = createCalendarDropHandlers({
    workspace,
    defaultCalendarId,
    router,
    t,
    setDraggingId,
  });

  async function changeEventTime(item: CalendarItem, startAt: string, endAt: string) {
    if (!item.editable) return false;
    if (item.recurring) {
      setDraft(itemDraft({ ...item, startAt, endAt }, defaultCalendarId ?? "", workspace.preferences.timezone));
      setConflicts([]);
      resetImport();
      setEventOpen(true);
      return false;
    }
    try {
      const input = { id: item.sourceId, startAt, endAt, expectedUpdatedAt: item.updatedAt };
      const result = await moveCalendarEvent(input);
      if (result.status === "conflict") {
        if (!window.confirm(t("conflictDescription"))) return false;
        await moveCalendarEvent({ ...input, allowConflicts: true });
      }
      router.refresh();
      return true;
    } catch {
      toast.error(t("timeChangeError"));
      return false;
    }
  }

  async function saveView() {
    const name = window.prompt(t("viewName"));
    if (!name) return;
    await saveCalendarView({ name, view, filters });
    router.refresh();
    toast.success(t("viewSaved"));
  }

  const periodLabel =
    view === "month"
      ? new Intl.DateTimeFormat(locale, {
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        }).format(parseDate(date))
      : `${new Intl.DateTimeFormat(locale, {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(parseDate(range.from))} – ${new Intl.DateTimeFormat(locale, {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }).format(parseDate(addDays(range.to, -1)))}`;
  const activeFilterCount =
    filters.sources.length +
    filters.people.length +
    filters.projects.length +
    filters.calendars.length +
    (filters.query ? 1 : 0);

  return (
    <div className="mx-auto flex w-full max-w-[112rem] flex-col gap-4">
      <CalendarToolbar
        periodLabel={periodLabel}
        t={t}
        movePeriod={movePeriod}
        navigate={navigate}
        workspace={workspace}
        view={view}
        ownCalendarIds={ownCalendarIds}
        filters={filters}
        selectCalendars={selectCalendars}
        setFiltersOpen={setFiltersOpen}
        activeFilterCount={activeFilterCount}
        openNewEvent={openNewEvent}
        defaultCalendarId={defaultCalendarId}
      />

      {showCalendarColors && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label={t("colorsByCalendar")}>
        {workspace.calendars.filter((calendar) => !filters.calendars.length || filters.calendars.includes(calendar.id)).map((calendar) => <span key={calendar.id} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{backgroundColor:calendar.color}} />{calendar.name}</span>)}
      </div>}

      <div className="grid min-h-[44rem] gap-4 2xl:grid-cols-[minmax(0,1fr)_18rem]">


        <div className="min-w-0 rounded-2xl border bg-card">
          {view === "week" && (
            <FlowWeek
              days={weekDays}
              today={clientToday}
              items={displayItems}
              draggingId={draggingId}
              locale={locale}
              t={t}
              preferences={workspace.preferences}
              onSelect={setSelected}
              onCommit={changeEventTime}
              onEdit={openEditEvent}
              onNew={openNewEvent}
              onDragStart={(event, item) => {
                setDraggingId(item.id);
                dragPayload(event, { type: "item", id: item.id });
              }}
              onDragEnd={() => setDraggingId(null)}
              onDropDay={(event, day) => void dropOnDay(event, day)}
              onDropTime={(event, day, hour) =>
                void dropOnTime(event, day, hour)
              }
            />
          )}
          {view === "month" && (
            <MonthView
              days={days}
              date={date}
              today={clientToday}
              items={displayItems}
              locale={locale}
              timezone={workspace.preferences.timezone}
              t={t}
              onSelect={setSelected}
              onNew={openNewEvent}
              onDrop={(event, day) => void dropOnDay(event, day)}
              onDragStart={(event, item) => {
                setDraggingId(item.id);
                dragPayload(event, { type: "item", id: item.id });
              }}
              onDragEnd={() => setDraggingId(null)}
            />
          )}
          {view === "agenda" && (
            <AgendaView
              days={days}
              items={displayItems}
              locale={locale}
              timezone={workspace.preferences.timezone}
              t={t}
              onSelect={setSelected}
            />
          )}
          {view === "team" && (
            <TeamView
              days={weekDays}
              items={displayItems}
              members={workspace.members}
              locale={locale}
              timezone={workspace.preferences.timezone}
              t={t}
              onSelect={setSelected}
            />
          )}
        </div>

        <aside
          className={cn(
            "min-w-0",
            selected
              ? "hidden lg:fixed lg:right-3 lg:bottom-3 lg:z-40 lg:block lg:max-h-[calc(100dvh-1.5rem)] lg:w-[22rem] lg:overflow-y-auto lg:drop-shadow-xl 2xl:static 2xl:w-auto 2xl:overflow-visible 2xl:drop-shadow-none"
              : "hidden 2xl:block",
          )}
        >
          {selected ? (
            <Inspector
              item={selected}
              locale={locale}
              timezone={workspace.preferences.timezone}
              t={t}
              onClose={() => setSelected(null)}
              onEdit={() => openEditEvent(selected)}
            />
          ) : (
            <UnscheduledTray
              tasks={filteredUnscheduledTasks}
              t={t}
              onDragStart={(event, id) => {
                setDraggingId(`task:${id}`);
                dragPayload(event, { type: "task", id });
              }}
              onDragEnd={() => setDraggingId(null)}
              onSelect={(task) =>
                router.push(canonicalTaskHref(task.id, task.projectId))
              }
            />
          )}
        </aside>
      </div>

      <CalendarFiltersDialog
        filtersOpen={filtersOpen}
        setFiltersOpen={setFiltersOpen}
        t={t}
        locale={locale}
        date={date}
        clientToday={clientToday}
        workspace={workspace}
        filters={filters}
        setFilters={setFilters}
        updateFilters={updateFilters}
        toggleFilter={toggleFilter}
        selectCalendars={selectCalendars}
        ownCalendarIds={ownCalendarIds}
        showCalendarColors={showCalendarColors}
        setShowCalendarColors={setShowCalendarColors}
        visibleSources={visibleSources}
        navigate={navigate}
        saveView={saveView}
        openNewCalendar={openNewCalendar}
        openEditCalendar={openEditCalendar}
      />

      <MobileBottomSheet
        open={Boolean(selected)}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        title={t("details")}
        description={selected?.title}
        closeLabel={t("close")}
      >
        {selected ? (
          <Inspector
            item={selected}
            locale={locale}
            timezone={workspace.preferences.timezone}
            t={t}
            onClose={() => setSelected(null)}
            onEdit={() => openEditEvent(selected)}
          />
        ) : null}
      </MobileBottomSheet>

      <EventDialog
        eventOpen={eventOpen}
        setEventOpen={setEventOpen}
        closeEventDialog={closeEventDialog}
        draft={draft}
        setDraft={setDraft}
        editDraft={editDraft}
        workspace={workspace}
        currentUser={currentUser}
        conflicts={conflicts}
        setConflicts={setConflicts}
        setSelected={setSelected}
        pending={pending}
        startTransition={startTransition}
        locale={locale}
        t={t}
        router={router}
        importSection={
          <EventImportSection
            draft={draft}
            setDraft={setDraft}
            manuallyEditedFields={manuallyEditedFields}
            importFileInput={importFileInput}
            importUrl={importUrl}
            setImportUrl={setImportUrl}
            importBusy={importBusy}
            setImportBusy={setImportBusy}
            importError={importError}
            setImportError={setImportError}
            importResult={importResult}
            setImportResult={setImportResult}
            t={t}
          />
        }
      />
      <CalendarSettingsDialog
        open={calendarOpen}
        onOpenChange={setCalendarOpen}
        draft={calendarDraft}
        setDraft={setCalendarDraft}
        onSubmit={submitCalendar}
        pending={pending}
        t={t}
      />
    </div>
  );
}
