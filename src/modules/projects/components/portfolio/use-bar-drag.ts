// Pointer and keyboard scheduling of Gantt bars: moving/resizing/placing task and project bars
// with live cascade previews, and the task-bar keyboard shortcuts. Used by portfolio-client.tsx.
"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import type { ScheduleEdit } from "@/modules/projects/schedule";
import type { ProjectDraft, Row, SetState, TaskDraft } from "./portfolio-types";
import { addCalendarDays } from "./portfolio-utils";
import type { useDependencyEditor } from "./use-dependency-editor";
import type { useDragClickGuard } from "./use-drag-click-guard";
import type { usePortfolioFocus } from "./use-portfolio-focus";
import type { useScheduleCommit } from "./use-schedule-commit";
import type { useTaskTreeActions } from "./use-task-tree-actions";

export function useBarDrag({
  rows,
  range,
  dayWidth,
  isDraftTask,
  inspectorOpen,
  setInspectorOpen,
  focusedTaskId,
  draggedRef,
  trackDragMovement,
  releaseDragFlag,
  scheduleCommitPending,
  clearDrag,
  setDragPreview,
  previewCascade,
  queuePreview,
  atomicPreview,
  commitSchedule,
  fsLeadAdjustments,
  withLagAdjustments,
  draft,
  projectDraft,
  dependencyCommitPending,
  dependencyEditorOpen,
  dependencyDraft,
  dependencySourceId,
  setDependencySourceId,
  setDependencyHoverId,
  cancelDependencyEditor,
  outdentRow,
  indentRow,
  enterTaskFocus,
  exitTaskFocus,
}: ReturnType<typeof useDragClickGuard> &
  Pick<
    ReturnType<typeof useScheduleCommit>,
    | "scheduleCommitPending"
    | "clearDrag"
    | "setDragPreview"
    | "previewCascade"
    | "queuePreview"
    | "atomicPreview"
    | "commitSchedule"
    | "fsLeadAdjustments"
    | "withLagAdjustments"
    | "draft"
    | "projectDraft"
  > &
  Pick<
    ReturnType<typeof useDependencyEditor>,
    | "dependencyCommitPending"
    | "dependencyEditorOpen"
    | "dependencyDraft"
    | "dependencySourceId"
    | "setDependencySourceId"
    | "setDependencyHoverId"
    | "cancelDependencyEditor"
  > &
  Pick<ReturnType<typeof useTaskTreeActions>, "outdentRow" | "indentRow"> &
  Pick<ReturnType<typeof usePortfolioFocus>, "enterTaskFocus" | "exitTaskFocus"> & {
    rows: Row[];
    range: { start: string; end: string };
    dayWidth: number;
    isDraftTask: (id: string) => boolean;
    inspectorOpen: boolean;
    setInspectorOpen: SetState<boolean>;
    focusedTaskId: string | null;
  }) {
  const dragRef = useRef<{
    pointerId: number;
    mode: "move" | "start" | "end" | "place";
    task: PortfolioTask;
    startX: number;
    timelineLeft: number;
    latest: { taskId: string; startDate: string; dueDate: string };
  } | null>(null);
  const projectDragRef = useRef<{
    pointerId: number;
    mode: "move" | "start" | "end" | "place";
    project: PortfolioSchedule["projects"][number];
    startX: number;
    original: { startDate: string; dueDate: string };
    latest: { startDate: string; dueDate: string };
  } | null>(null);

  function cancelTaskDrag(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    draggedRef.current = true;
    clearDrag();
    releaseDragFlag();
  }

  function cancelProjectDrag(event: ReactPointerEvent) {
    const drag = projectDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    projectDragRef.current = null;
    draggedRef.current = true;
    clearDrag();
    releaseDragFlag();
  }

  function startDrag(event: ReactPointerEvent, task: PortfolioTask, mode: "move" | "start" | "end") {
    if (
      scheduleCommitPending ||
      dependencyCommitPending ||
      dependencyEditorOpen ||
      !task.startDate ||
      !task.dueDate
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedRef.current = false;
    const latest = { taskId: task.id, startDate: task.startDate, dueDate: task.dueDate };
    dragRef.current = {
      pointerId: event.pointerId,
      mode,
      task,
      startX: event.clientX,
      timelineLeft: event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0,
      latest,
    };
    setDragPreview({
      preview: null,
      draft: { ...latest, mode: mode === "move" ? "move" : mode === "start" ? "resize-start" : "resize-end" },
      projectDraft: null,
    });
  }

  function startUnscheduledDrag(event: ReactPointerEvent, task: PortfolioTask) {
    if (
      scheduleCommitPending ||
      dependencyCommitPending ||
      dependencyEditorOpen ||
      task.startDate ||
      task.dueDate
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedRef.current = false;
    const timelineLeft = event.currentTarget.parentElement?.getBoundingClientRect().left ?? 0;
    const suggestion = rows.find((row) => row.task?.id === task.id)?.placement;
    const startDate =
      suggestion?.startDate ??
      addCalendarDays(
        addCalendarDays(
          range.start,
          Math.max(0, Math.round((event.clientX - timelineLeft) / dayWidth)),
        ),
        0,
      );
    const dueDate =
      suggestion?.dueDate ?? (task.isMilestone ? startDate : addCalendarDays(startDate, 4));
    const latest = { taskId: task.id, startDate, dueDate };
    dragRef.current = {
      pointerId: event.pointerId,
      mode: "place",
      task,
      startX: event.clientX,
      timelineLeft,
      latest,
    };
    const nextDraft = { ...latest, mode: "place" as const };
    previewCascade(taskScheduleEdit(task.id, "place", latest), nextDraft);
  }

  function moveDrag(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    trackDragMovement(event.clientX, drag.startX);
    if (drag.mode === "place") {
      const dayOffset = Math.max(
        0,
        Math.round((event.clientX - drag.timelineLeft) / dayWidth),
      );
      const startDate = addCalendarDays(range.start, dayOffset);
      drag.latest = {
        taskId: drag.task.id,
        startDate,
        dueDate: drag.task.isMilestone ? startDate : addCalendarDays(startDate, 4),
      };
      const nextDraft = { ...drag.latest, mode: "place" as const };
      queuePreview(taskScheduleEdit(drag.task.id, "place", drag.latest), nextDraft, null);
      return;
    }
    if (!drag.task.startDate || !drag.task.dueDate) return;
    const delta = Math.round((event.clientX - drag.startX) / dayWidth);
    let startDate = drag.task.startDate;
    let dueDate = drag.task.dueDate;
    if (drag.mode === "move") {
      startDate = addCalendarDays(drag.task.startDate, delta);
      dueDate = drag.task.isMilestone ? startDate : addCalendarDays(drag.task.dueDate, delta);
    } else if (drag.mode === "start") {
      startDate = addCalendarDays(drag.task.startDate, delta);
      if (startDate > dueDate) startDate = dueDate;
    } else {
      dueDate = addCalendarDays(drag.task.dueDate, delta);
      if (dueDate < startDate) dueDate = startDate;
    }
    drag.latest = { taskId: drag.task.id, startDate, dueDate };
    const nextDraft: TaskDraft = {
      ...drag.latest,
      mode: drag.mode === "move" ? "move" : drag.mode === "start" ? "resize-start" : "resize-end",
    };
    const lagAdjustments =
      drag.mode === "move"
        ? fsLeadAdjustments(drag.task.id, startDate)
        : [];
    queuePreview(
      taskScheduleEdit(drag.task.id, drag.mode, drag.latest),
      nextDraft,
      null,
      withLagAdjustments(lagAdjustments),
    );
  }

  function taskScheduleEdit(
    taskId: string,
    mode: "move" | "start" | "end" | "place",
    latest: { startDate: string; dueDate: string },
  ): ScheduleEdit {
    return {
      entityType: "task",
      entityId: taskId,
      startDate: latest.startDate,
      dueDate: latest.dueDate,
      operation:
        mode === "start" ? "resize-start" : mode === "end" ? "resize-end" : mode,
    };
  }

  function endDrag(event: ReactPointerEvent) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    releaseDragFlag();
    if (
      drag.latest.startDate === drag.task.startDate &&
      drag.latest.dueDate === drag.task.dueDate
    ) {
      clearDrag();
      return;
    }
    const edit = taskScheduleEdit(drag.task.id, drag.mode, drag.latest);
    const finalDraft: TaskDraft = {
      ...drag.latest,
      mode: drag.mode === "move" ? "move" : drag.mode === "start" ? "resize-start" : drag.mode === "end" ? "resize-end" : "place",
    };
    const lagAdjustments =
      drag.mode === "move"
        ? fsLeadAdjustments(drag.task.id, drag.latest.startDate)
        : [];
    setDragPreview(
      atomicPreview(edit, finalDraft, null, withLagAdjustments(lagAdjustments)),
    );
    void commitSchedule(edit, lagAdjustments);
  }

  function handleTaskScheduleKey(
    event: React.KeyboardEvent<HTMLButtonElement>,
    row: Row,
  ) {
    if (!row.task) return;
    if (isDraftTask(row.task.id) && event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      event.preventDefault();
      return;
    }
    if (
      event.altKey &&
      (event.key === "ArrowLeft" || event.key === "ArrowRight")
    ) {
      event.preventDefault();
      void (event.key === "ArrowLeft"
        ? outdentRow(row.task)
        : indentRow(row.task));
      return;
    }
    if (event.key.toLocaleLowerCase() === "f" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      enterTaskFocus(row.task);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (dependencyEditorOpen || dependencyDraft) {
        cancelDependencyEditor();
      } else if (dependencySourceId) {
        setDependencySourceId(null);
        setDependencyHoverId(null);
      } else if (draft || projectDraft) clearDrag();
      else if (inspectorOpen) setInspectorOpen(false);
      else if (focusedTaskId) exitTaskFocus();
      return;
    }
    if (event.key === "Enter" && draft?.taskId === row.task.id) {
      event.preventDefault();
      void commitSchedule({
        entityType: "task",
        entityId: row.task.id,
        startDate: draft.startDate,
        dueDate: draft.dueDate,
        operation: row.task.startDate ? "move" : "place",
      });
      return;
    }
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const baseStart =
      draft?.taskId === row.task.id
        ? draft.startDate
        : row.startDate ?? row.placement?.startDate;
    const baseDue =
      draft?.taskId === row.task.id
        ? draft.dueDate
        : row.dueDate ?? row.placement?.dueDate;
    if (!baseStart || !baseDue) return;
    const offset = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 7 : 1);
    const nextDraft = {
      taskId: row.task.id,
      startDate: addCalendarDays(baseStart, offset),
      dueDate: addCalendarDays(baseDue, offset),
      mode: "move" as const,
    };
    previewCascade({
      entityType: "task",
      entityId: row.task.id,
      operation: row.task.startDate ? "move" : "place",
      startDate: nextDraft.startDate,
      dueDate: nextDraft.dueDate,
    }, nextDraft);
  }

  function startProjectDrag(
    event: ReactPointerEvent,
    project: PortfolioSchedule["projects"][number],
    row: Row,
    mode: "move" | "start" | "end",
  ) {
    if (
      scheduleCommitPending ||
      dependencyCommitPending ||
      dependencyEditorOpen ||
      !row.startDate ||
      !row.dueDate
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedRef.current = false;
    const original = { startDate: row.startDate, dueDate: row.dueDate };
    projectDragRef.current = {
      pointerId: event.pointerId,
      mode,
      project,
      startX: event.clientX,
      original,
      latest: original,
    };
    setDragPreview({
      preview: null,
      draft: null,
      projectDraft: {
        projectId: project.id,
        ...original,
        mode: mode === "move" ? "move" : mode === "start" ? "resize-start" : "resize-end",
      },
    });
  }

  function startProjectPlacement(
    event: ReactPointerEvent,
    project: PortfolioSchedule["projects"][number],
    row: Row,
  ) {
    if (scheduleCommitPending || !row.placement) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedRef.current = false;
    const original = {
      startDate: row.placement.startDate,
      dueDate: row.placement.dueDate,
    };
    projectDragRef.current = {
      pointerId: event.pointerId,
      mode: "place",
      project,
      startX: event.clientX,
      original,
      latest: original,
    };
    const nextProjectDraft = { projectId: project.id, ...original, mode: "place" as const };
    previewCascade(projectScheduleEdit(project.id, "place", original), null, nextProjectDraft);
  }

  function moveProjectDrag(event: ReactPointerEvent) {
    const drag = projectDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    trackDragMovement(event.clientX, drag.startX);
    const delta = Math.round((event.clientX - drag.startX) / dayWidth);
    let startDate = drag.original.startDate;
    let dueDate = drag.original.dueDate;
    if (drag.mode === "move" || drag.mode === "place") {
      startDate = addCalendarDays(startDate, delta);
      dueDate = addCalendarDays(dueDate, delta);
    } else if (drag.mode === "start") {
      startDate = addCalendarDays(startDate, delta);
      if (startDate > dueDate) startDate = dueDate;
    } else {
      dueDate = addCalendarDays(dueDate, delta);
      if (dueDate < startDate) dueDate = startDate;
    }
    drag.latest = { startDate, dueDate };
    const nextProjectDraft: ProjectDraft = {
      projectId: drag.project.id,
      ...drag.latest,
      mode: drag.mode === "move" || drag.mode === "place" ? drag.mode : drag.mode === "start" ? "resize-start" : "resize-end",
    };
    queuePreview(projectScheduleEdit(drag.project.id, drag.mode, drag.latest), null, nextProjectDraft);
  }

  function projectScheduleEdit(
    projectId: string,
    mode: "move" | "start" | "end" | "place",
    latest: { startDate: string; dueDate: string },
  ): ScheduleEdit {
    return {
      entityType: "project",
      entityId: projectId,
      startDate: latest.startDate,
      dueDate: latest.dueDate,
      operation:
        mode === "start" ? "resize-start" : mode === "end" ? "resize-end" : mode,
    };
  }

  function handleScheduleResizeKey(
    event: React.KeyboardEvent<HTMLButtonElement>,
    row: Row,
    project: PortfolioSchedule["projects"][number],
    edge: "start" | "end",
  ) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    if (
      scheduleCommitPending ||
      dependencyCommitPending ||
      dependencyEditorOpen ||
      !row.startDate ||
      !row.dueDate
    ) {
      return;
    }

    const offset =
      (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 7 : 1);
    let startDate = row.startDate;
    let dueDate = row.dueDate;
    if (edge === "start") {
      startDate = addCalendarDays(startDate, offset);
      if (startDate > dueDate) startDate = dueDate;
    } else {
      dueDate = addCalendarDays(dueDate, offset);
      if (dueDate < startDate) dueDate = startDate;
    }
    if (startDate === row.startDate && dueDate === row.dueDate) return;

    const mode = edge === "start" ? "resize-start" : "resize-end";
    if (row.task) {
      const edit = taskScheduleEdit(row.task.id, edge, { startDate, dueDate });
      setDragPreview(
        atomicPreview(
          edit,
          { taskId: row.task.id, startDate, dueDate, mode },
          null,
        ),
      );
      void commitSchedule(edit);
      return;
    }

    const edit = projectScheduleEdit(project.id, edge, { startDate, dueDate });
    setDragPreview(
      atomicPreview(
        edit,
        null,
        { projectId: project.id, startDate, dueDate, mode },
      ),
    );
    void commitSchedule(edit);
  }

  function endProjectDrag(event: ReactPointerEvent) {
    const drag = projectDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    projectDragRef.current = null;
    releaseDragFlag();
    if (
      drag.mode !== "place" &&
      drag.latest.startDate === drag.original.startDate &&
      drag.latest.dueDate === drag.original.dueDate
    ) {
      clearDrag();
      return;
    }
    const edit = projectScheduleEdit(drag.project.id, drag.mode, drag.latest);
    const finalDraft: ProjectDraft = {
      projectId: drag.project.id,
      ...drag.latest,
      mode: drag.mode === "move" || drag.mode === "place" ? drag.mode : drag.mode === "start" ? "resize-start" : "resize-end",
    };
    setDragPreview(atomicPreview(edit, null, finalDraft));
    void commitSchedule(edit);
  }

  return {
    dragRef, cancelTaskDrag, cancelProjectDrag, startDrag, startUnscheduledDrag, moveDrag, endDrag,
    handleTaskScheduleKey, startProjectDrag, startProjectPlacement, moveProjectDrag,
    handleScheduleResizeKey, endProjectDrag,
  };
}
