"use client";

// Create/edit event dialog, including saving (single occurrence, this-and-future, whole series) and deleting.
// Used by calendar-client.tsx; the import section is passed in as `importSection`.
import { type FormEvent, type ReactNode, type TransitionStartFunction } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleAlert, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { userIdentityColor } from "@/lib/user-mark-colors";
import { UserIdentity } from "@/components/user-identity";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  deleteCalendarEvent,
  upsertCalendarEvent,
} from "../../actions";
import {
  splitCalendarEventSeries,
  truncateCalendarEventSeries,
  upsertCalendarOccurrence,
} from "../../series-actions";
import { addDays, zonedDateTimeToUtc } from "../../date-utils";
import type { CalendarItem, CalendarWorkspace } from "../../types";
import { cn } from "@/lib/utils";
import type { CalendarConflict, EventDraft, ImportableDraftField } from "./calendar-types";
import { AustrianDateInput, AustrianTimeInput } from "./austrian-date-time-inputs";
import { ProjectPicker } from "@/modules/context/components/project-links-field";
import { saveProjectLinks } from "@/modules/context/project-link-actions";

export function EventDialog({
  eventOpen,
  setEventOpen,
  closeEventDialog,
  draft,
  setDraft,
  editDraft,
  workspace,
  currentUser,
  conflicts,
  setConflicts,
  setSelected,
  pending,
  startTransition,
  locale,
  t,
  router,
  importSection,
}: {
  eventOpen: boolean;
  setEventOpen: (open: boolean) => void;
  closeEventDialog: () => void;
  draft: EventDraft;
  setDraft: (draft: EventDraft) => void;
  editDraft: <K extends ImportableDraftField>(field: K, value: EventDraft[K]) => void;
  workspace: CalendarWorkspace;
  currentUser: { id: string; name: string };
  conflicts: CalendarConflict[];
  setConflicts: (conflicts: CalendarConflict[]) => void;
  setSelected: (item: CalendarItem | null) => void;
  pending: boolean;
  startTransition: TransitionStartFunction;
  locale: string;
  t: ReturnType<typeof useTranslations<"calendar">>;
  router: ReturnType<typeof useRouter>;
  importSection: ReactNode;
}) {
  function recurrenceRule() {
    if (draft.repeat === "none") return null;
    return `FREQ=${draft.repeat.toUpperCase()}`;
  }

  async function saveEvent(allowConflicts = false) {
    const [startYear, startMonth, startDay] = draft.startDate
      .split("-")
      .map(Number);
    const [startHour, startMinute] = draft.startTime.split(":").map(Number);
    const startAt = draft.allDay
      ? null
      : zonedDateTimeToUtc(
          {
            year: startYear,
            month: startMonth,
            day: startDay,
            hour: startHour,
            minute: startMinute,
          },
          draft.timezone,
        ).toISOString();
    const timedEndDate = draft.endDate;
    const [endYear, endMonth, endDay] = timedEndDate.split("-").map(Number);
    const [endHour, endMinute] = draft.endTime.split(":").map(Number);
    const endAt = draft.allDay
      ? null
      : zonedDateTimeToUtc(
          {
            year: endYear,
            month: endMonth,
            day: endDay,
            hour: endHour,
            minute: endMinute,
          },
          draft.timezone,
        ).toISOString();
    if ((!draft.allDay && endAt! <= startAt!) || (draft.allDay && draft.endDate <= draft.startDate)) {
      toast.error(t("endAfterStart"));
      return;
    }
    if (
      draft.id &&
      draft.recurring &&
      draft.scope === "occurrence" &&
      draft.occurrenceKey
    ) {
      await upsertCalendarOccurrence({
        eventId: draft.id,
        occurrenceKey: draft.occurrenceKey,
        cancelled: false,
        override: draft.allDay
          ? {
              title: draft.title,
              description: draft.description,
              location: draft.location,
              address: draft.address,
              startDate: draft.startDate,
              endDate: draft.endDate,
            }
          : {
              title: draft.title,
              description: draft.description,
              location: draft.location,
              address: draft.address,
              startAt: startAt!,
              endAt: endAt!,
            },
      });
      // Project tags belong to the whole series.
      await saveProjectLinks({
        targetType: "calendarEvent",
        targetId: draft.id,
        projectIds: draft.projects.map((project) => project.id),
      });
      closeEventDialog();
      router.refresh();
      toast.success(t("eventSaved"));
      return;
    }
    const eventInput = {
      id: draft.id,
      calendarId: draft.calendarId,
      kind: draft.kind,
      title: draft.title,
      description: draft.description,
      location: draft.location,
      address: draft.address,
      allDay: draft.allDay,
      startDate: draft.allDay ? draft.startDate : null,
      endDate: draft.allDay ? draft.endDate : null,
      startAt,
      endAt,
      timezone: draft.timezone,
      availability: draft.availability,
      recurrenceRule: recurrenceRule(),
      linkedTaskId: null,
      attendeeIds: draft.attendeeIds,
      reminderMinutes:
        draft.reminderMinutes === null ? [] : [draft.reminderMinutes],
      expectedUpdatedAt: draft.expectedUpdatedAt,
      allowConflicts,
      projectIds: draft.projects.map((project) => project.id),
    };
    const result =
      draft.id &&
      draft.recurring &&
      draft.scope === "future" &&
      draft.occurrenceKey
        ? await splitCalendarEventSeries({
            event: eventInput,
            occurrenceKey: draft.occurrenceKey,
          })
        : await upsertCalendarEvent(eventInput);
    if (result.status === "conflict") {
      setConflicts(result.conflicts);
      return;
    }
    closeEventDialog();
    router.refresh();
    toast.success(t("eventSaved"));
  }

  function submitEvent(event: FormEvent) {
    event.preventDefault();
    startTransition(() => {
      void saveEvent().catch(() => toast.error(t("conflictDescription")));
    });
  }

  function removeEvent() {
    if (!draft.id) return;
    startTransition(() => {
      void (async () => {
        if (
          draft.recurring &&
          draft.scope === "occurrence" &&
          draft.occurrenceKey
        ) {
          await upsertCalendarOccurrence({
            eventId: draft.id!,
            occurrenceKey: draft.occurrenceKey,
            cancelled: true,
            override: {},
          });
        } else if (
          draft.recurring &&
          draft.scope === "future" &&
          draft.occurrenceKey &&
          draft.expectedUpdatedAt
        ) {
          await truncateCalendarEventSeries({
            eventId: draft.id!,
            occurrenceKey: draft.occurrenceKey,
            expectedUpdatedAt: draft.expectedUpdatedAt,
          });
        } else {
          await deleteCalendarEvent(draft.id!);
        }
        closeEventDialog();
        setSelected(null);
        router.refresh();
        toast.success(t("eventDeleted"));
      })().catch(() => toast.error(t("conflictDescription")));
    });
  }

  return (
    <Dialog
      open={eventOpen}
      onOpenChange={(open) => {
        if (open) setEventOpen(true);
        else closeEventDialog();
      }}
    >
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submitEvent}>
          <DialogHeader>
            <DialogTitle>{draft.id ? t("editEvent") : t("newEvent")}</DialogTitle>
            <DialogDescription>{t("eventFormHint")}</DialogDescription>
          </DialogHeader>
          <div className="mt-5 grid gap-4">
            {draft.recurring && (
              <div className="flex rounded-lg border bg-muted/35 p-1">
                {(["occurrence", "future", "series"] as const).map((scope) => (
                  <button
                    type="button"
                    key={scope}
                    onClick={() => setDraft({ ...draft, scope })}
                    className={cn(
                      "flex-1 rounded-md px-3 py-1.5 text-xs font-medium",
                      draft.scope === scope && "bg-background shadow-sm",
                    )}
                  >
                    {scope === "occurrence"
                      ? t("thisOccurrence")
                      : scope === "future"
                        ? t("thisAndFuture")
                        : t("entireSeries")}
                  </button>
                ))}
              </div>
            )}
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("eventTitle")}</span>
              <Input
                autoFocus
                required
                value={draft.title}
                onChange={(event) =>
                  editDraft("title", event.target.value)
                }
                placeholder={t("eventTitlePlaceholder")}
              />
            </label>
            <div className="grid gap-1.5">
              <span className="text-xs font-medium">{t("projects")}</span>
              <ProjectPicker
                value={draft.projects}
                onChange={(projects) => setDraft({ ...draft, projects })}
                options={workspace.projects.map((project) => ({ ...project, archived: false }))}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.allDay}
                onChange={(event) =>
                  editDraft("allDay", event.target.checked)
                }
                className="size-4 accent-foreground"
              />
              {t("allDay")}
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium">{t("start")}</span>
                <div
                  className={cn(
                    "grid min-w-0 gap-2",
                    draft.allDay
                      ? "grid-cols-1"
                      : "grid-cols-[minmax(0,1fr)_6.5rem]",
                  )}
                >
                  <AustrianDateInput
                    key={`start-date-${draft.startDate}`}
                    value={draft.startDate}
                    onChange={(value) =>
                      editDraft("startDate", value)
                    }
                    label={t("startDate")}
                    pickerLabel={t("chooseDate", { label: t("startDate") })}
                    placeholder={t("datePlaceholder")}
                    invalidMessage={t("invalidDate")}
                  />
                  {!draft.allDay && (
                    <AustrianTimeInput
                      key={`start-time-${draft.startTime}`}
                      value={draft.startTime}
                      onChange={(value) =>
                        editDraft("startTime", value)
                      }
                      label={t("startTime")}
                      invalidMessage={t("invalidTime")}
                    />
                  )}
                </div>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium">{t("end")}</span>
                <div className={cn("grid min-w-0 gap-2", draft.allDay ? "grid-cols-1" : "grid-cols-[minmax(0,1fr)_6.5rem]")}>
                  <AustrianDateInput
                      key={`end-date-${draft.endDate}`}
                      value={draft.allDay ? addDays(draft.endDate, -1) : draft.endDate}
                      min={draft.startDate}
                      onChange={(value) =>
                        editDraft("endDate", draft.allDay ? addDays(value, 1) : value)
                      }
                      label={t("endDate")}
                      pickerLabel={t("chooseDate", { label: t("endDate") })}
                      placeholder={t("datePlaceholder")}
                      invalidMessage={t("invalidDate")}
                    />
                  {!draft.allDay && (
                    <AustrianTimeInput
                      key={`end-time-${draft.endTime}`}
                      value={draft.endTime}
                      onChange={(value) =>
                        editDraft("endTime", value)
                      }
                      label={t("endTime")}
                      invalidMessage={t("invalidTime")}
                    />
                  )}
                </div>
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium">{t("calendarLabel")}</span>
                <select
                  className="h-8 rounded-lg border bg-background px-2.5 text-sm"
                  value={draft.calendarId}
                  onChange={(event) =>
                    setDraft({ ...draft, calendarId: event.target.value })
                  }
                >
                  {workspace.calendars
                    .filter(
                      (calendar) =>
                        calendar.role === "owner" || calendar.role === "editor",
                    )
                    .map((calendar) => (
                      <option value={calendar.id} key={calendar.id}>
                        {calendar.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium">{t("location")}</span>
                <Input
                  value={draft.location}
                  onChange={(event) =>
                    editDraft("location", event.target.value)
                  }
                  placeholder={t("locationPlaceholder")}
                />
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("address")}</span>
              <Input
                value={draft.address}
                onChange={(event) =>
                  editDraft("address", event.target.value)
                }
                placeholder={t("addressPlaceholder")}
                autoComplete="street-address"
              />
            </label>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">{t("eventOptions")}</summary>
              <div className="mt-3 grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium">{t("repeat")}</span>
                <select
                  className="h-8 rounded-lg border bg-background px-2.5 text-sm"
                  value={draft.repeat}
                  onChange={(event) =>
                    editDraft(
                      "repeat",
                      event.target.value as EventDraft["repeat"],
                    )
                  }
                >
                  <option value="none">{t("repeatNone")}</option>
                  <option value="daily">{t("repeatDaily")}</option>
                  <option value="weekly">{t("repeatWeekly")}</option>
                  <option value="monthly">{t("repeatMonthly")}</option>
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium">{t("availability")}</span>
                <select
                  className="h-8 rounded-lg border bg-background px-2.5 text-sm"
                  value={draft.availability}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      availability: event.target.value as "busy" | "free",
                    })
                  }
                >
                  <option value="busy">{t("busy")}</option>
                  <option value="free">{t("free")}</option>
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium">{t("reminder")}</span>
                <select
                  className="h-8 rounded-lg border bg-background px-2.5 text-sm"
                  value={draft.reminderMinutes ?? "none"}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      reminderMinutes:
                        event.target.value === "none"
                          ? null
                          : Number(event.target.value),
                    })
                  }
                >
                  <option value="none">{t("noReminder")}</option>
                  <option value="5">{t("fiveMinutes")}</option>
                  <option value="15">{t("fifteenMinutes")}</option>
                  <option value="60">{t("oneHour")}</option>
                </select>
              </label>
            </div>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("timezone")}</span>
              <Input
                value={draft.timezone}
                onChange={(event) =>
                  editDraft("timezone", event.target.value)
                }
                className="font-mono text-xs"
              />
            </label>
            <fieldset className="grid gap-2">
              <legend className="text-xs font-medium">{t("attendees")}</legend>
              <div className="flex flex-wrap gap-2">
                {workspace.members
                  .filter((member) => member.id !== currentUser.id)
                  .map((member) => {
                    const checked = draft.attendeeIds.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        style={checked ? { borderColor: userIdentityColor(member.id), backgroundColor: userIdentityColor(member.id, "highlight") } : undefined}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-xs",
                          checked && "ring-1 ring-current",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() =>
                            setDraft({
                              ...draft,
                              attendeeIds: checked
                                ? draft.attendeeIds.filter(
                                    (id) => id !== member.id,
                                  )
                                : [...draft.attendeeIds, member.id],
                            })
                          }
                          className="sr-only"
                        />
                        <UserIdentity userId={member.id} name={member.name} compact />
                      </label>
                    );
                  })}
              </div>
            </fieldset>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium">{t("descriptionLabel")}</span>
              <Textarea
                value={draft.description}
                onChange={(event) =>
                  editDraft("description", event.target.value)
                }
                rows={3}
              />
            </label>
              </div>
            </details>
            {importSection}
            {conflicts.length > 0 && (
              <div className="rounded-xl border border-[#E11D48]/30 bg-[#E11D48]/5 p-3">
                <div className="flex gap-2">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-[#E11D48]" />
                  <div>
                    <p className="text-sm font-semibold">{t("conflictTitle")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("conflictDescription")}
                    </p>
                    <ul className="mt-2 space-y-1 text-xs">
                      {conflicts.map((conflict) => (
                        <li key={conflict.id}>
                          {conflict.title} ·{" "}
                          {new Intl.DateTimeFormat(locale, {
                            timeStyle: "short",
                          }).format(new Date(conflict.startAt))}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="sticky -bottom-6 z-10 mt-5 border-t bg-background py-4">
            {draft.id && (
              <Button
                type="button"
                variant="destructive"
                onClick={removeEvent}
                disabled={pending}
                className="sm:mr-auto"
              >
                <Trash2 />
                {t("deleteEvent")}
              </Button>
            )}
            {conflicts.length > 0 && (
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  startTransition(() => {
                    void saveEvent(true).catch(() =>
                      toast.error(t("conflictDescription")),
                    );
                  })
                }
                disabled={pending}
              >
                {t("saveAnyway")}
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {t("saveEvent")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
