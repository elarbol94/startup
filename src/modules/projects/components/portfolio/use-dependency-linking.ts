// Drawing new dependencies from a bar's connector (click to link, press-and-drag to resize
// instead) and resolving bar clicks while linking. Used by portfolio-client.tsx.
"use client";

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import {
  assertDependencyEndpoints,
  hasScheduleCycle,
} from "@/modules/projects/schedule";
import { DRAG_CLICK_THRESHOLD } from "./portfolio-constants";
import type { DependencyDraft } from "./portfolio-types";
import type { useBarDrag } from "./use-bar-drag";
import type { useDeadlineDrag } from "./use-deadline-drag";
import type { useDependencyEditor } from "./use-dependency-editor";
import type { useDragClickGuard } from "./use-drag-click-guard";
import type { useScheduleCommit } from "./use-schedule-commit";
import type { useTaskTreeActions } from "./use-task-tree-actions";

export function useDependencyLinking({
  isDraftTask,
  effectiveSchedule,
  dependencySourceId,
  setDependencySourceId,
  setDependencyHoverId,
  setDependencyDraft,
  setDependencyEditorOpen,
  dependencyCommitPending,
  dependencyEditorOpen,
  draggedRef,
  releaseDragFlag,
  dragRef,
  moveDrag,
  endDrag,
  cancelTaskDrag,
  setDragPreview,
  scheduleCommitPending,
  previewFrameRef,
  deadlinePreviewFrameRef,
  openTask,
}: Pick<ReturnType<typeof useDragClickGuard>, "draggedRef" | "releaseDragFlag"> &
  Pick<
    ReturnType<typeof useDependencyEditor>,
    | "dependencySourceId"
    | "setDependencySourceId"
    | "setDependencyHoverId"
    | "setDependencyDraft"
    | "setDependencyEditorOpen"
    | "dependencyCommitPending"
    | "dependencyEditorOpen"
  > &
  Pick<ReturnType<typeof useBarDrag>, "dragRef" | "moveDrag" | "endDrag" | "cancelTaskDrag"> &
  Pick<
    ReturnType<typeof useScheduleCommit>,
    "setDragPreview" | "scheduleCommitPending" | "previewFrameRef"
  > &
  Pick<ReturnType<typeof useDeadlineDrag>, "deadlinePreviewFrameRef"> &
  Pick<ReturnType<typeof useTaskTreeActions>, "openTask"> & {
    isDraftTask: (id: string) => boolean;
    effectiveSchedule: PortfolioSchedule;
  }) {
  const connectorGestureRef = useRef<{
    pointerId: number;
    task: PortfolioTask;
    startX: number;
    timelineLeft: number;
    activatedResize: boolean;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  useEffect(
    () => () => {
      if (previewFrameRef.current !== null) {
        cancelAnimationFrame(previewFrameRef.current);
      }
      if (deadlinePreviewFrameRef.current !== null) {
        cancelAnimationFrame(deadlinePreviewFrameRef.current);
      }
      if (connectorGestureRef.current) {
        clearTimeout(connectorGestureRef.current.timer);
      }
    },
    [previewFrameRef, deadlinePreviewFrameRef],
  );

  function validDependencyTarget(targetId: string) {
    if (isDraftTask(targetId)) return false;
    const sourceId = dependencySourceId;
    if (!sourceId || sourceId === targetId) return false;
    if (
      effectiveSchedule.dependencies.some(
        (dependency) =>
          dependency.predecessorTaskId === sourceId &&
          dependency.successorTaskId === targetId,
      )
    ) {
      return false;
    }
    try {
      assertDependencyEndpoints(effectiveSchedule.tasks, {
        predecessorTaskId: sourceId,
        successorTaskId: targetId,
      });
      return !hasScheduleCycle(effectiveSchedule.tasks, [
        ...effectiveSchedule.dependencies,
        {
          predecessorTaskId: sourceId,
          successorTaskId: targetId,
          dependencyType: "finish_to_start",
          lagDays: 0,
        },
      ]);
    } catch {
      return false;
    }
  }

  function createGraphicalDependency(targetId: string) {
    const sourceId = dependencySourceId;
    if (!sourceId || !validDependencyTarget(targetId)) return;
    const nextDraft: DependencyDraft = {
      id: `draft-${sourceId}-${targetId}`,
      predecessorTaskId: sourceId,
      successorTaskId: targetId,
      dependencyType: "finish_to_start",
      lagDays: 0,
      routeOffsetDays: null,
      routeOffsetRows: null,
      createdAt: new Date(),
      isNew: true,
    };
    setDependencyDraft(nextDraft);
    setDependencyEditorOpen(true);
    setDependencySourceId(null);
    setDependencyHoverId(null);
  }

  function activateConnectorResize() {
    const gesture = connectorGestureRef.current;
    if (
      !gesture ||
      gesture.activatedResize ||
      !gesture.task.startDate ||
      !gesture.task.dueDate
    ) {
      return;
    }
    gesture.activatedResize = true;
    clearTimeout(gesture.timer);
    draggedRef.current = true;
    const latest = {
      taskId: gesture.task.id,
      startDate: gesture.task.startDate,
      dueDate: gesture.task.dueDate,
    };
    dragRef.current = {
      pointerId: gesture.pointerId,
      mode: "end",
      task: gesture.task,
      startX: gesture.startX,
      timelineLeft: gesture.timelineLeft,
      latest,
    };
    setDragPreview({
      preview: null,
      draft: { ...latest, mode: "resize-end" },
      projectDraft: null,
    });
  }

  function startConnectorGesture(
    event: ReactPointerEvent<HTMLElement>,
    task: PortfolioTask,
  ) {
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
    const pointerId = event.pointerId;
    const gesture = {
      pointerId,
      task,
      startX: event.clientX,
      timelineLeft:
        event.currentTarget
          .closest<HTMLElement>("[data-timeline-row]")
          ?.getBoundingClientRect().left ?? 0,
      activatedResize: false,
      timer: setTimeout(() => {
        if (connectorGestureRef.current?.pointerId === pointerId) {
          activateConnectorResize();
        }
      }, 180),
    };
    connectorGestureRef.current = gesture;
  }

  function moveConnectorGesture(event: ReactPointerEvent<HTMLElement>) {
    const gesture = connectorGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (
      !gesture.activatedResize &&
      Math.abs(event.clientX - gesture.startX) > DRAG_CLICK_THRESHOLD
    ) {
      activateConnectorResize();
    }
    if (gesture.activatedResize) moveDrag(event);
  }

  function endConnectorGesture(event: ReactPointerEvent<HTMLElement>) {
    const gesture = connectorGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    clearTimeout(gesture.timer);
    connectorGestureRef.current = null;
    if (gesture.activatedResize) {
      endDrag(event);
      return;
    }
    draggedRef.current = true;
    setDependencySourceId((current) =>
      current === gesture.task.id ? null : gesture.task.id,
    );
    setDependencyHoverId(null);
    releaseDragFlag();
  }

  /** Opens the inspector, unless this click is the tail end of a drag. */
  function openTaskFromBar(task: PortfolioTask | undefined) {
    if (draggedRef.current || !task) return;
    if (dependencySourceId) {
      if (dependencySourceId === task.id) {
        setDependencySourceId(null);
      } else {
        void createGraphicalDependency(task.id);
      }
      return;
    }
    openTask(task);
  }

  function cancelConnectorGesture(event: ReactPointerEvent<HTMLElement>) {
    const gesture = connectorGestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    clearTimeout(gesture.timer);
    connectorGestureRef.current = null;
    if (gesture.activatedResize) {
      cancelTaskDrag(event);
      return;
    }
    draggedRef.current = true;
    releaseDragFlag();
  }

  return {
    validDependencyTarget, startConnectorGesture, moveConnectorGesture, endConnectorGesture,
    cancelConnectorGesture, openTaskFromBar,
  };
}
