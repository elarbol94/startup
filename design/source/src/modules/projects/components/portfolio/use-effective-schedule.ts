// The schedule as currently displayed: the confirmed schedule overlaid with live drag,
// deadline and dependency-draft previews (plus the embedded draft task). Used by portfolio-client.tsx.
"use client";

import { useMemo } from "react";
import type { PortfolioSchedule } from "@/modules/projects/queries";
import {
  previewScheduleEdit,
  type SchedulePreview,
} from "@/modules/projects/schedule";
import type {
  DeadlinePreview,
  DependencyDraft,
  DragPreview,
  EmbeddedProjectPlanner,
  TaskDraft,
} from "./portfolio-types";

export function useEffectiveSchedule({
  schedule,
  embedded,
  dragPreview,
  activePreview,
  draft,
  deadlinePreview,
  dependencyDraft,
}: {
  schedule: PortfolioSchedule;
  embedded?: EmbeddedProjectPlanner;
  dragPreview: DragPreview | null;
  activePreview: SchedulePreview | null;
  draft: TaskDraft | null;
  deadlinePreview: DeadlinePreview | null;
  dependencyDraft: DependencyDraft | null;
}) {
  const effectiveDependencies = useMemo(
    () => {
      const baseDependencies = dragPreview?.dependencies ?? schedule.dependencies;
      return (
      dependencyDraft
        ? dependencyDraft.isNew ||
          !baseDependencies.some(
            (dependency) => dependency.id === dependencyDraft.id,
          )
          ? [...baseDependencies, dependencyDraft]
          : baseDependencies.map((dependency) =>
              dependency.id === dependencyDraft.id
                ? dependencyDraft
                : dependency,
            )
        : baseDependencies
      );
    },
    [dependencyDraft, dragPreview?.dependencies, schedule.dependencies],
  );

  const dependencySchedulePreview = useMemo<SchedulePreview | null>(() => {
    if (!dependencyDraft) return null;
    const successor = schedule.tasks.find(
      (task) => task.id === dependencyDraft.successorTaskId,
    );
    if (!successor?.startDate || !successor.dueDate) return null;
    try {
      return previewScheduleEdit({
        tasks: schedule.tasks,
        projects: schedule.projects.map((project) => ({
          id: project.id,
          startDate: project.plannedStartDate,
          dueDate: project.targetEndDate,
        })),
        dependencies: effectiveDependencies,
        edit: {
          entityType: "task",
          entityId: successor.id,
          operation: "move",
          startDate: successor.startDate,
          dueDate: successor.dueDate,
        },
      });
    } catch {
      return null;
    }
  }, [
    dependencyDraft,
    effectiveDependencies,
    schedule.projects,
    schedule.tasks,
  ]);

  const persistedPreview = useMemo<PortfolioSchedule>(() => {
    const schedulePreview = dependencyDraft
      ? dependencySchedulePreview
      : activePreview;
    if (!schedulePreview && !deadlinePreview && !dependencyDraft) {
      return schedule;
    }
    const taskChanges = new Map(
      (schedulePreview?.changes ?? [])
        .filter((change) => change.entityType === "task")
        .map((change) => [change.entityId, change]),
    );
    const projectChanges = new Map(
      (schedulePreview?.changes ?? [])
        .filter((change) => change.entityType === "project")
        .map((change) => [change.entityId, change]),
    );
    return {
      ...schedule,
      tasks: schedule.tasks.map((task) => {
        const change = taskChanges.get(task.id);
        return change
          ? {
              ...task,
              startDate: change.afterStartDate,
              dueDate: change.afterDueDate,
            }
          : task;
      }),
      projects: schedule.projects.map((project) => {
        const change = projectChanges.get(project.id);
        return change
          ? {
              ...project,
              plannedStartDate: change.afterStartDate,
              targetEndDate: change.afterDueDate,
            }
          : project;
      }),
      deadlines: schedule.deadlines.map((deadline) =>
        deadlinePreview?.id === deadline.id
          ? {
              ...deadline,
              dueDate: deadlinePreview.deadlineDate,
              deadlineAt: deadlinePreview.deadlineAt,
              updatedAt: deadlinePreview.updatedAt,
            }
          : deadline,
      ),
      dependencies: effectiveDependencies,
    };
  }, [
    activePreview,
    deadlinePreview,
    dependencyDraft,
    dependencySchedulePreview,
    effectiveDependencies,
    schedule,
  ]);

  // The draft is a display row only: persisted schedule previews and actions
  // never receive its ID, including project-wide cascades and dependency edits.
  const effectiveSchedule = useMemo<PortfolioSchedule>(() => {
    if (!embedded) return persistedPreview;
    const draftTask = draft?.taskId === embedded.draftTask.id
      ? { ...embedded.draftTask, startDate: draft.startDate, dueDate: draft.dueDate }
      : embedded.draftTask;
    return { ...persistedPreview, tasks: [...persistedPreview.tasks, draftTask], deadlines: [] };
  }, [persistedPreview, embedded, draft]);

  return { effectiveSchedule };
}
