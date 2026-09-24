"use client";

// Drag payload encoding and drop handling (move events/deadlines/project items, create focus blocks from tasks).
// Used by calendar-client.tsx.
import { type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { moveContextualDeadline } from "@/modules/projects/deadline-actions";
import {
  applyPortfolioScheduleChange,
  previewPortfolioScheduleChange,
} from "@/modules/projects/schedule-change-actions";
import {
  reapplyPortfolioScheduleChange,
  revertPortfolioScheduleChange,
} from "@/modules/projects/schedule-history-actions";
import { createTaskFocusBlock, moveCalendarEvent } from "../../actions";
import { addDays, daysBetween, zonedDateTimeToUtc } from "../../date-utils";
import type { CalendarItem, CalendarWorkspace } from "../../types";

export function dragPayload(event: DragEvent, payload: object) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("application/x-flow-calendar", JSON.stringify(payload));
}

function readDrag(event: DragEvent) {
  try {
    return JSON.parse(
      event.dataTransfer.getData("application/x-flow-calendar"),
    ) as { type: "item" | "task"; id: string };
  } catch {
    return null;
  }
}

export function createCalendarDropHandlers({
  workspace,
  defaultCalendarId,
  router,
  t,
  setDraggingId,
}: {
  workspace: CalendarWorkspace;
  defaultCalendarId: string | undefined;
  router: ReturnType<typeof useRouter>;
  t: ReturnType<typeof useTranslations<"calendar">>;
  setDraggingId: (id: string | null) => void;
}) {
  async function moveProjectItem(item: CalendarItem, targetDate: string) {
    if (!item.startDate || !item.endDate) return;
    const duration = Math.max(1, daysBetween(item.startDate, item.endDate));
    const dueDate = addDays(targetDate, duration - 1);
    const entityType: "project" | "task" =
      item.kind === "project" ? "project" : "task";
    const edit = {
      entityType,
      entityId: item.sourceId,
      startDate: targetDate,
      dueDate,
      operation: "move" as const,
    };
    const preview = await previewPortfolioScheduleChange(edit);
    if (
      !window.confirm(
        t("scheduleImpact", { count: preview.changes.length }),
      )
    ) {
      return;
    }
    const result = await applyPortfolioScheduleChange({
      ...edit,
      expectedPreview: { changes: preview.changes },
    });
    // Expected failures come back as a result; the caller's catch shows them.
    if (!result.ok) throw new Error(result.code);
    router.refresh();
    toast.success(t("scheduleMoved"), {
      action: result.changeSetId
        ? {
            label: t("undo"),
            onClick: () => {
              void revertPortfolioScheduleChange(result.changeSetId!).then((reverted) => {
                router.refresh();
                if (!reverted.ok) {
                  toast.error(t("calendarSaveError"));
                  return;
                }
                toast(t("scheduleMoved"), {
                  action: {
                    label: t("redo"),
                    onClick: () => {
                      void reapplyPortfolioScheduleChange(
                        result.changeSetId!,
                      ).then((reapplied) => {
                        router.refresh();
                        if (!reapplied.ok) toast.error(t("calendarSaveError"));
                      });
                    },
                  },
                });
              });
            },
          }
        : undefined,
    });
  }

  async function dropOnDay(event: DragEvent, targetDate: string) {
    event.preventDefault();
    const payload = readDrag(event);
    if (!payload) return;
    if (payload.type === "task") {
      await dropOnTime(event, targetDate, 9);
      return;
    }
    const item = workspace.items.find((candidate) => candidate.id === payload.id);
    if (!item) return;
    try {
      if (item.kind === "project" || item.kind === "task" || item.kind === "milestone") {
        if (item.projectId || item.kind === "project") {
          await moveProjectItem(item, targetDate);
        }
      } else if (item.kind === "deadline" && item.allDay) {
        const moved = await moveContextualDeadline({
          id: item.sourceId,
          deadlineDate: targetDate,
          deadlineAt: null,
          expectedUpdatedAt: item.updatedAt,
        });
        if (!moved.ok) throw new Error(moved.code);
        router.refresh();
      } else if ((item.kind === "event" || item.kind === "focus") && item.allDay) {
        const duration = Math.max(
          1,
          daysBetween(item.startDate!, item.endDate!),
        );
        await moveCalendarEvent({
          id: item.sourceId,
          startDate: targetDate,
          endDate: addDays(targetDate, duration),
          expectedUpdatedAt: item.updatedAt,
        });
        router.refresh();
      }
    } catch {
      toast.error(t("conflictDescription"));
    } finally {
      setDraggingId(null);
    }
  }

  async function dropOnTime(event: DragEvent, targetDate: string, hour: number) {
    event.preventDefault();
    const payload = readDrag(event);
    if (!payload || !defaultCalendarId) {
      setDraggingId(null);
      return;
    }
    const [year, month, day] = targetDate.split("-").map(Number);
    const start = zonedDateTimeToUtc(
      { year, month, day, hour: Math.floor(hour), minute: Math.round((hour % 1) * 60) },
      workspace.preferences.timezone,
    );
    const end = new Date(start.getTime() + 60 * 60_000);
    try {
      if (payload.type === "task") {
        const result = await createTaskFocusBlock({
          taskId: payload.id,
          calendarId: defaultCalendarId,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          timezone: workspace.preferences.timezone,
        });
        if (result.status === "conflict") {
          toast.error(t("conflictTitle"));
        } else {
          toast.success(t("focusCreated"));
          router.refresh();
        }
        return;
      }
      const item = workspace.items.find((candidate) => candidate.id === payload.id);
      if (!item) return;
      if (item.kind === "task" && !item.allDay) return;
      if (item.kind === "task" || item.kind === "milestone") {
        const result = await createTaskFocusBlock({
          taskId: item.sourceId,
          calendarId: defaultCalendarId,
          startAt: start.toISOString(),
          endAt: end.toISOString(),
          timezone: workspace.preferences.timezone,
        });
        if (result.status === "saved") router.refresh();
        return;
      }
      if ((item.kind === "event" || item.kind === "focus") && item.startAt && item.endAt) {
        const duration =
          new Date(item.endAt).getTime() - new Date(item.startAt).getTime();
        const result = await moveCalendarEvent({
          id: item.sourceId,
          startAt: start.toISOString(),
          endAt: new Date(start.getTime() + duration).toISOString(),
          expectedUpdatedAt: item.updatedAt,
        });
        if (result.status === "conflict") {
          if (window.confirm(t("conflictDescription"))) {
            await moveCalendarEvent({
              id: item.sourceId,
              startAt: start.toISOString(),
              endAt: new Date(start.getTime() + duration).toISOString(),
              expectedUpdatedAt: item.updatedAt,
              allowConflicts: true,
            });
          }
        }
        router.refresh();
      }
    } catch {
      toast.error(t("conflictDescription"));
    } finally {
      setDraggingId(null);
    }
  }

  return { dropOnDay, dropOnTime };
}
