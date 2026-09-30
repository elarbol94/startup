// Local schedule previews during drags, committing schedule edits (with FS lead adjustments)
// and undo/redo of committed change sets. Used by portfolio-client.tsx.
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { GitBranch } from "lucide-react";
import { toast } from "sonner";
import { upsertTaskDependency } from "@/modules/projects/dependency-actions";
import { applyPortfolioScheduleChange, fitTaskToChildren } from "@/modules/projects/schedule-change-actions";
import { reapplyPortfolioScheduleChange, revertPortfolioScheduleChange } from "@/modules/projects/schedule-history-actions";
import type {
  PortfolioSchedule,
  PortfolioTask,
} from "@/modules/projects/queries";
import {
  dependencyTypeOf,
  previewScheduleEdit,
  type ScheduleEdit,
  type SchedulePreview,
} from "@/modules/projects/schedule";
import type {
  DeadlinePreview,
  DependencyDraft,
  DependencyLagAdjustment,
  DragPreview,
  EmbeddedProjectPlanner,
  PortfolioDependency,
  ProjectDraft,
  SetState,
  TaskDraft,
} from "./portfolio-types";
import { calendarDistance } from "./portfolio-utils";
import { ScheduleCommitError, scheduleErrorMessage } from "./schedule-error-message";

export function useScheduleCommit({
  schedule,
  embedded,
  isDraftTask,
  refreshSchedule,
  setDeadlinePreview,
  setDependencyDraft,
  setDependencyEditorOpen,
}: {
  schedule: PortfolioSchedule;
  embedded?: EmbeddedProjectPlanner;
  isDraftTask: (id: string) => boolean;
  refreshSchedule: () => Promise<void>;
  setDeadlinePreview: SetState<DeadlinePreview | null>;
  setDependencyDraft: SetState<DependencyDraft | null>;
  setDependencyEditorOpen: SetState<boolean>;
}) {
  const t = useTranslations("projects");
  const tCommon = useTranslations("common");
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
  const [scheduleCommitPending, setScheduleCommitPending] = useState(false);
  const draft = dragPreview?.draft ?? null;
  const projectDraft = dragPreview?.projectDraft ?? null;
  const activePreview = dragPreview?.preview ?? null;
  const [undoChangeSetId, setUndoChangeSetId] = useState<string | null>(null);
  const [undoPending, setUndoPending] = useState(false);
  const [redoChangeSetId, setRedoChangeSetId] = useState<string | null>(null);
  const [redoPending, setRedoPending] = useState(false);
  const previewFrameRef = useRef<number | null>(null);
  const pendingPreviewRef = useRef<{
    edit: ScheduleEdit;
    draft: TaskDraft | null;
    projectDraft: ProjectDraft | null;
    dependencies?: PortfolioDependency[];
  } | null>(null);
  const confirmedScheduleRef = useRef(schedule);

  useEffect(() => {
    if (confirmedScheduleRef.current === schedule) return;
    confirmedScheduleRef.current = schedule;
    pendingPreviewRef.current = null;
    if (previewFrameRef.current !== null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    setDragPreview(null);
    setDeadlinePreview(null);
    setDependencyDraft(null);
    setDependencyEditorOpen(false);
  }, [schedule, setDeadlinePreview, setDependencyDraft, setDependencyEditorOpen]);

  function localSchedulePreview(
    edit: ScheduleEdit,
    dependencies: PortfolioDependency[] = schedule.dependencies,
  ) {
    return previewScheduleEdit({
      tasks: schedule.tasks,
      projects: schedule.projects.map((project) => ({
        id: project.id,
        startDate: project.plannedStartDate,
        dueDate: project.targetEndDate,
      })),
      dependencies,
      edit,
    });
  }

  function atomicPreview(
    input: ScheduleEdit,
    taskDraft: TaskDraft | null,
    nextProjectDraft: ProjectDraft | null,
    dependencies?: PortfolioDependency[],
  ): DragPreview {
    if (input.entityType === "task" && isDraftTask(input.entityId)) {
      return { preview: null, draft: taskDraft, projectDraft: null };
    }
    try {
      const preview = localSchedulePreview(input, dependencies);
      return { preview, draft: taskDraft, projectDraft: nextProjectDraft, dependencies };
    } catch {
      return { preview: null, draft: taskDraft, projectDraft: nextProjectDraft, dependencies };
    }
  }

  function previewCascade(
    input: ScheduleEdit,
    taskDraft: TaskDraft | null = null,
    nextProjectDraft: ProjectDraft | null = null,
    dependencies?: PortfolioDependency[],
  ) {
    setDragPreview(atomicPreview(input, taskDraft, nextProjectDraft, dependencies));
  }

  function queuePreview(
    input: ScheduleEdit,
    taskDraft: TaskDraft | null,
    nextProjectDraft: ProjectDraft | null,
    dependencies?: PortfolioDependency[],
  ) {
    pendingPreviewRef.current = {
      edit: input,
      draft: taskDraft,
      projectDraft: nextProjectDraft,
      dependencies,
    };
    if (previewFrameRef.current !== null) return;
    previewFrameRef.current = requestAnimationFrame(() => {
      previewFrameRef.current = null;
      const pending = pendingPreviewRef.current;
      pendingPreviewRef.current = null;
      if (!pending) return;
      setDragPreview(
        atomicPreview(pending.edit, pending.draft, pending.projectDraft, pending.dependencies),
      );
    });
  }

  function clearDrag() {
    pendingPreviewRef.current = null;
    if (previewFrameRef.current !== null) {
      cancelAnimationFrame(previewFrameRef.current);
      previewFrameRef.current = null;
    }
    setDragPreview(null);
  }

  const undoScheduleChange = useCallback(async (changeSetId = undoChangeSetId) => {
    if (!changeSetId || undoPending) return;
    setUndoPending(true);
    try {
      const result = await revertPortfolioScheduleChange(changeSetId);
      if (!result.ok) {
        setUndoChangeSetId(null);
        toast.error(scheduleErrorMessage(t, result.code, "undo"));
        return;
      }
      setUndoChangeSetId(null);
      setRedoChangeSetId(changeSetId);
      await refreshSchedule();
      toast.success(t("scheduleRestored"));
    } catch {
      toast.error(t("undoUnavailable"));
    } finally {
      setUndoPending(false);
    }
  }, [refreshSchedule, t, undoChangeSetId, undoPending]);

  const redoScheduleChange = useCallback(async (changeSetId = redoChangeSetId) => {
    if (!changeSetId || redoPending) return;
    setRedoPending(true);
    try {
      const result = await reapplyPortfolioScheduleChange(changeSetId);
      if (!result.ok) {
        setRedoChangeSetId(null);
        toast.error(scheduleErrorMessage(t, result.code, "redo"));
        return;
      }
      setRedoChangeSetId(null);
      setUndoChangeSetId(changeSetId);
      await refreshSchedule();
      toast.success(t("scheduleSaved"));
    } catch {
      toast.error(t("redoUnavailable"));
    } finally {
      setRedoPending(false);
    }
  }, [redoChangeSetId, redoPending, refreshSchedule, t]);

  useEffect(() => {
    function handleUndoShortcut(event: KeyboardEvent) {
      if ((!event.ctrlKey && !event.metaKey) || event.altKey) {
        return;
      }

      const key = event.key.toLocaleLowerCase();
      const isUndo = key === "z" && !event.shiftKey;
      const isRedo = key === "z" && event.shiftKey;
      if (!isUndo && !isRedo) return;

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable='true'], [role='textbox']"))
      ) {
        return;
      }

      if (isUndo && (!undoChangeSetId || undoPending)) return;
      if (isRedo && (!redoChangeSetId || redoPending)) return;
      event.preventDefault();
      if (isUndo) void undoScheduleChange();
      else void redoScheduleChange();
    }

    window.addEventListener("keydown", handleUndoShortcut);
    return () => window.removeEventListener("keydown", handleUndoShortcut);
  }, [
    redoChangeSetId,
    redoPending,
    redoScheduleChange,
    undoChangeSetId,
    undoPending,
    undoScheduleChange,
  ]);

  function scheduleImpactDescription(preview: SchedulePreview) {
    const impact = preview.impact;
    return t("dragImpact", {
      days: impact.dayDelta,
      tasks: impact.affectedTaskCount,
      containers: impact.expandedTaskCount + impact.expandedProjectCount,
    });
  }

  /** Shrinks or grows a summary to its children, with undo (R4). */
  async function fitTaskDates(task: PortfolioTask) {
    try {
      const result = await fitTaskToChildren(task.id);
      if (!result.ok) {
        toast.error(scheduleErrorMessage(t, result.code, "schedule"));
        return;
      }
      await refreshSchedule();
      offerScheduleUndo(result.changeSetId);
    } catch {
      toast.error(tCommon("error"));
    }
  }

  function offerScheduleUndo(
    changeSetId: string | null,
    description?: string,
  ) {
    if (!changeSetId) return;
    setUndoChangeSetId(changeSetId);
    setRedoChangeSetId(null);
    toast(t("scheduleSaved"), {
      description,
      duration: 5000,
      icon: <GitBranch className="size-4" />,
      className:
        "!border-amber-200 !bg-amber-50 !text-amber-950 dark:!border-amber-700/40 dark:!bg-amber-950/30 dark:!text-amber-100",
      descriptionClassName: "!text-amber-900 dark:!text-amber-100",
      action: {
        label: t("undo"),
        onClick: () => {
          void undoScheduleChange(changeSetId);
        },
      },
    });
  }

  /**
   * Commits a drag straight from the drop and offers undo (R8). The server
   * recomputes the cascade itself, so nothing from the live preview is trusted
   * here; a concurrent edit surfaces as a rejected apply rather than silent loss.
   */
  async function saveDependencyLag(
    dependency: PortfolioDependency,
    lagDays: number,
  ) {
    const result = await upsertTaskDependency({
      id: dependency.id,
      predecessorTaskId: dependency.predecessorTaskId,
      successorTaskId: dependency.successorTaskId,
      dependencyType: dependencyTypeOf(dependency),
      lagDays,
      routeOffsetDays: dependency.routeOffsetDays,
      routeOffsetRows: dependency.routeOffsetRows,
    });
    if (!result.ok) throw new ScheduleCommitError(result.code);
  }

  /**
   * A direct bar move is explicit scheduling intent. When an FS successor is
   * dropped into its predecessor's span, retain the FS relationship and encode
   * that overlap as a negative lag (lead), rather than snapping the bar back.
   */
  function fsLeadAdjustments(
    taskId: string,
    startDate: string,
  ): DependencyLagAdjustment[] {
    return schedule.dependencies.flatMap((dependency) => {
      if (
        dependency.successorTaskId !== taskId ||
        dependencyTypeOf(dependency) !== "finish_to_start"
      ) {
        return [];
      }
      const predecessor = schedule.tasks.find(
        (task) => task.id === dependency.predecessorTaskId,
      );
      if (!predecessor?.dueDate || startDate > predecessor.dueDate) return [];
      const lagDays = calendarDistance(predecessor.dueDate, startDate) - 1;
      if (lagDays < -365 || lagDays > 365 || lagDays === dependency.lagDays) {
        return [];
      }
      return [{ dependency, lagDays }];
    });
  }

  function withLagAdjustments(adjustments: DependencyLagAdjustment[]) {
    if (adjustments.length === 0) return schedule.dependencies;
    const lagById = new Map(
      adjustments.map((adjustment) => [adjustment.dependency.id, adjustment.lagDays]),
    );
    return schedule.dependencies.map((dependency) =>
      lagById.has(dependency.id)
        ? { ...dependency, lagDays: lagById.get(dependency.id)! }
        : dependency,
    );
  }

  async function commitSchedule(
    input: ScheduleEdit,
    lagAdjustments: DependencyLagAdjustment[] = [],
  ) {
    if (scheduleCommitPending) return;
    if (embedded && input.entityType === "task" && isDraftTask(input.entityId)) {
      if (!input.startDate || !input.dueDate) return;
      embedded.onDraftDatesChange({ startDate: input.startDate, dueDate: input.dueDate });
      clearDrag();
      return;
    }
    setScheduleCommitPending(true);
    let savedAdjustments: DependencyLagAdjustment[] = [];
    try {
      for (const adjustment of lagAdjustments) {
        await saveDependencyLag(adjustment.dependency, adjustment.lagDays);
        savedAdjustments = [...savedAdjustments, adjustment];
      }
      const preview = localSchedulePreview(
        input,
        withLagAdjustments(lagAdjustments),
      );
      const result = await applyPortfolioScheduleChange({
        ...input,
        expectedPreview: { changes: preview.changes },
      });
      if (!result.ok) throw new ScheduleCommitError(result.code);
      await refreshSchedule();
      offerScheduleUndo(
        result.changeSetId,
        scheduleImpactDescription(preview),
      );
    } catch (error) {
      for (const adjustment of savedAdjustments) {
        try {
          await saveDependencyLag(
            adjustment.dependency,
            adjustment.dependency.lagDays,
          );
        } catch {
          // Refresh below exposes any concurrent update that prevented rollback.
        }
      }
      clearDrag();
      await refreshSchedule();
      toast.error(
        error instanceof ScheduleCommitError
          ? scheduleErrorMessage(t, error.code, "schedule")
          : tCommon("error"),
      );
    } finally {
      setScheduleCommitPending(false);
    }
  }

  return {
    dragPreview, setDragPreview, scheduleCommitPending, draft, projectDraft, activePreview, previewFrameRef,
    atomicPreview, previewCascade, queuePreview, clearDrag, offerScheduleUndo, fitTaskDates,
    fsLeadAdjustments, withLagAdjustments, commitSchedule,
  };
}
