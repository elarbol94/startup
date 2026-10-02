"use client";

// State of the full event dialog: the draft, conflicts, the import section and the ways to open
// it (new, edit, duplicate, from quick create, prefilled draft). Used by calendar-client.tsx.
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { addDays, daysBetween } from "../../date-utils";
import type { CalendarItem, CalendarWorkspace } from "../../types";
import type { CalendarConflict, EventDraft, ImportableDraftField, ImportResult } from "./calendar-types";
import { pickProjects } from "./calendar-client-utils";
import { blankDraft, itemDraft } from "./event-draft-utils";
import type { QuickCreateDraft } from "./quick-create/quick-create-popover";

export function useEventDialogState({
  workspace,
  date,
  defaultCalendarId,
  shouldOpenNewEvent,
  presetProjectId,
  projectFilter,
  onCloseRequestedNewEvent,
  noEditableCalendarMessage,
}: {
  workspace: CalendarWorkspace;
  date: string;
  defaultCalendarId: string | undefined;
  /** The page was opened with ?new=event. */
  shouldOpenNewEvent: boolean;
  presetProjectId: string | null;
  /** Projects the calendar is filtered to; a single one presets new events. */
  projectFilter: string[];
  /** Called when the dialog that ?new=event opened is closed (to drop the URL flag). */
  onCloseRequestedNewEvent: () => void;
  noEditableCalendarMessage: string;
}) {
  const timezone = workspace.preferences.timezone;
  const [eventOpen, setEventOpen] = useState(shouldOpenNewEvent);
  const [draft, setDraft] = useState<EventDraft>(() =>
    blankDraft(defaultCalendarId ?? "", timezone, date, 9, pickProjects(workspace.projects, presetProjectId ? [presetProjectId] : [])),
  );
  const [conflicts, setConflicts] = useState<CalendarConflict[]>([]);
  const importFileInput = useRef<HTMLInputElement>(null);
  const [importUrl, setImportUrl] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [manuallyEditedFields, setManuallyEditedFields] = useState<Set<ImportableDraftField>>(() => new Set());

  function openDraft(next: EventDraft) {
    setConflicts([]);
    setDraft(next);
    setImportUrl("");
    setImportBusy(false);
    setImportError("");
    setImportResult(null);
    setManuallyEditedFields(new Set());
    setEventOpen(true);
  }

  const previousOpenNewEvent = useRef(shouldOpenNewEvent);
  useEffect(() => {
    const wasRequested = previousOpenNewEvent.current;
    previousOpenNewEvent.current = shouldOpenNewEvent;
    if (!shouldOpenNewEvent || wasRequested || !defaultCalendarId) return;
    // Opening is a response to the URL changing to ?new=event while the page stays mounted.
    openDraft(blankDraft(defaultCalendarId, timezone, date, 9, pickProjects(workspace.projects, presetProjectId ? [presetProjectId] : [])));
  }, [date, defaultCalendarId, presetProjectId, shouldOpenNewEvent, timezone, workspace.projects]);

  function closeEventDialog() {
    setEventOpen(false);
    if (shouldOpenNewEvent) onCloseRequestedNewEvent();
  }

  function editDraft<K extends ImportableDraftField>(field: K, value: EventDraft[K]) {
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

  function newDraft(day: string, hour: number) {
    if (!defaultCalendarId) {
      toast.error(noEditableCalendarMessage);
      return null;
    }
    return blankDraft(defaultCalendarId, timezone, day, hour, pickProjects(workspace.projects, projectFilter.length === 1 ? projectFilter : []));
  }

  function openNewEvent(day = date, hour = 9) {
    const next = newDraft(day, hour);
    if (next) openDraft(next);
  }

  function openEditEvent(item: CalendarItem) {
    if (item.kind !== "event" && item.kind !== "focus") return;
    openDraft(itemDraft(item, defaultCalendarId ?? "", timezone));
  }

  /** Opens the dialog with a copy of the item as a new event (in a calendar the user can edit). */
  function openDuplicate(item: CalendarItem) {
    if (item.kind !== "event" && item.kind !== "focus") return;
    const source = itemDraft(item, defaultCalendarId ?? "", timezone);
    const writable = workspace.calendars.some(
      (calendar) => calendar.id === source.calendarId && (calendar.role === "owner" || calendar.role === "editor"),
    );
    if (!writable && !defaultCalendarId) {
      toast.error(noEditableCalendarMessage);
      return;
    }
    openDraft({
      ...source,
      id: undefined,
      calendarId: writable ? source.calendarId : defaultCalendarId!,
      expectedUpdatedAt: null,
      occurrenceKey: null,
      recurring: false,
      scope: "series",
    });
  }

  /** "More options" from the quick-create popover: the full dialog with what was typed so far. */
  function openFromQuickCreate(quick: QuickCreateDraft) {
    const base = newDraft(quick.day, 9);
    if (!base) return;
    openDraft({
      ...base,
      title: quick.title,
      calendarId: quick.calendarId || base.calendarId,
      startDate: quick.day,
      // An end at or before the start (e.g. 24:00 → "00:00") runs into the next day.
      endDate: quick.endTime <= quick.startTime ? addDays(quick.day, 1) : quick.day,
      startTime: quick.startTime,
      endTime: quick.endTime,
    });
  }

  return {
    eventOpen,
    setEventOpen,
    closeEventDialog,
    draft,
    setDraft,
    editDraft,
    conflicts,
    setConflicts,
    openDraft,
    openNewEvent,
    openEditEvent,
    openDuplicate,
    openFromQuickCreate,
    importState: {
      draft,
      setDraft,
      manuallyEditedFields,
      importFileInput,
      importUrl,
      setImportUrl,
      importBusy,
      setImportBusy,
      importError,
      setImportError,
      importResult,
      setImportResult,
    },
  };
}
