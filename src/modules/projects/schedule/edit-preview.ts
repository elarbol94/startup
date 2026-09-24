// Portfolio schedule edit planner (task and project edits, containers, impact summary)
// shared by the browser drag preview and server apply. Re-exported from ../schedule.ts.
import { ScheduleError } from "../schedule-errors";
import type {
  ScheduleChangeCause,
  ScheduleConstraint,
  ScheduleEdit,
  ScheduleEntityChange,
  ScheduleOperation,
  SchedulePlanInput,
  SchedulePreview,
  ScheduleTask,
} from "./schedule-types";
import {
  addCalendarDays,
  calendarDayDistance,
  parseIsoDate,
  toIsoDate,
} from "./date-math";
import { dependencyConflicts, hasScheduleCycle } from "./dependency-graph";
import { previewScheduleCascade } from "./cascade-planner";
import { taskDescendants } from "./task-tree";
import {
  constrainingTaskIds,
  descendantEnvelope,
  expandContainerEnvelope,
  shiftScheduledTasks,
} from "./container-rollups";

function normalizedEditDates(
  edit: ScheduleEdit,
  milestone = false,
): { startDate: string; dueDate: string } {
  if (!edit.startDate || !edit.dueDate) {
    throw new ScheduleError("invalid", "Schedule dates are required");
  }
  const startDate = toIsoDate(parseIsoDate(edit.startDate));
  const dueDate = milestone
    ? startDate
    : toIsoDate(parseIsoDate(edit.dueDate));
  if (dueDate < startDate) throw new ScheduleError("invalid", "Due date precedes start date");
  return { startDate, dueDate };
}

function isOutwardExpansion(
  before: Pick<ScheduleTask, "startDate" | "dueDate">,
  after: Pick<ScheduleTask, "startDate" | "dueDate">,
): boolean {
  return Boolean(
    (after.startDate &&
      (!before.startDate || after.startDate < before.startDate)) ||
      (after.dueDate && (!before.dueDate || after.dueDate > before.dueDate)),
  );
}

/**
 * Pure portfolio planner shared by the browser's fluent drag preview and the
 * server's authoritative apply. It is intentionally data-only: callers supply
 * the complete dependency-connected scope and receive a canonical change set.
 */
export function previewScheduleEdit(input: SchedulePlanInput): SchedulePreview {
  const edit = { ...input.edit };
  if (hasScheduleCycle(input.tasks, input.dependencies)) {
    throw new ScheduleError("cycle", "Dependency cycle");
  }

  const originalTasks = new Map(
    input.tasks.map((task) => [task.id, { ...task }]),
  );
  const workingTasks = new Map(
    input.tasks.map((task) => [task.id, { ...task }]),
  );
  const originalProjects = new Map(
    input.projects.map((project) => [project.id, { ...project }]),
  );
  const workingProjects = new Map(
    input.projects.map((project) => [project.id, { ...project }]),
  );
  const constraints: ScheduleConstraint[] = [];
  const subtreeTaskIds = new Set<string>();

  const taskList = () =>
    input.tasks.map((task) => workingTasks.get(task.id)!);

  const applyCascade = (
    taskId: string,
    operation: ScheduleOperation,
    dates?: { startDate: string; dueDate: string },
    rigidTaskIds?: string[],
  ): void => {
    for (const change of previewScheduleCascade(
      taskList(),
      input.dependencies,
      {
        taskId,
        operation,
        startDate: dates?.startDate,
        dueDate: dates?.dueDate,
        rigidTaskIds,
      },
    )) {
      const task = workingTasks.get(change.taskId)!;
      workingTasks.set(change.taskId, {
        ...task,
        startDate: change.afterStartDate,
        dueDate: change.afterDueDate,
      });
    }
  };

  if (edit.entityType === "task") {
    const target = workingTasks.get(edit.entityId);
    if (!target) throw new ScheduleError("not-found", "Task not found");
    const descendants = taskDescendants(taskList(), target.id);
    if (edit.operation === "move") {
      descendants.forEach((task) => subtreeTaskIds.add(task.id));
    }
    if (
      descendants.length > 0 &&
      (edit.operation === "resize-start" ||
        edit.operation === "resize-end" ||
        edit.operation === "place")
    ) {
      const dates = normalizedEditDates(edit, target.isMilestone);
      const envelope = descendantEnvelope(descendants);
      const clampedStart = Boolean(
        envelope.startDate && dates.startDate > envelope.startDate,
      );
      const clampedEnd = Boolean(
        envelope.dueDate && dates.dueDate < envelope.dueDate,
      );
      if (clampedStart || clampedEnd) {
        constraints.push({
          entityType: "task",
          entityId: target.id,
          startDate: envelope.startDate,
          dueDate: envelope.dueDate,
          requestedStartDate: dates.startDate,
          requestedDueDate: dates.dueDate,
          clampedStart,
          clampedEnd,
          constrainingTaskIds: constrainingTaskIds(descendants, envelope),
        });
      }
    }
    applyCascade(
      target.id,
      edit.operation,
      edit.operation === "fit"
        ? undefined
        : normalizedEditDates(edit, target.isMilestone),
    );
  } else {
    const project = workingProjects.get(edit.entityId);
    if (!project) throw new ScheduleError("not-found", "Project not found");
    const members = taskList().filter(
      (task) => task.projectId === project.id,
    );
    const envelope = descendantEnvelope(members);

    if (edit.operation === "fit") {
      if (!envelope.startDate || !envelope.dueDate) {
        throw new ScheduleError("invalid", "Schedule at least one task before fitting the project");
      }
      workingProjects.set(project.id, {
        ...project,
        startDate: envelope.startDate,
        dueDate: envelope.dueDate,
      });
    } else {
      const dates = normalizedEditDates(edit);
      if (edit.operation === "move") {
        const currentStart = project.startDate ?? envelope.startDate;
        if (!currentStart) {
          throw new ScheduleError("invalid", "Place the project before moving it");
        }
        const offset = calendarDayDistance(currentStart, dates.startDate);
        for (const shifted of shiftScheduledTasks(members, offset)) {
          const task = workingTasks.get(shifted.id)!;
          workingTasks.set(shifted.id, { ...task, ...shifted });
          if (
            task.startDate !== shifted.startDate ||
            task.dueDate !== shifted.dueDate
          ) {
            subtreeTaskIds.add(task.id);
          }
        }
        const currentDue = project.dueDate ?? envelope.dueDate;
        workingProjects.set(project.id, {
          ...project,
          startDate: dates.startDate,
          dueDate: currentDue
            ? addCalendarDays(currentDue, offset)
            : dates.dueDate,
        });

        // A no-op root edit runs the dependency fixed point over the shifted
        // graph, including cross-project successor subtrees.
        const anchor = taskList().find(
          (task) =>
            task.projectId === project.id && task.startDate && task.dueDate,
        );
        if (anchor) {
          applyCascade(anchor.id, "place", {
            startDate: anchor.startDate!,
            dueDate: anchor.dueDate!,
          }, members.map((task) => task.id));
        }
      } else {
        const requestedStart =
          edit.operation === "resize-end"
            ? project.startDate ?? dates.startDate
            : dates.startDate;
        const requestedDue =
          edit.operation === "resize-start"
            ? project.dueDate ?? dates.dueDate
            : dates.dueDate;
        const clampedStart = Boolean(
          envelope.startDate && requestedStart > envelope.startDate,
        );
        const clampedEnd = Boolean(
          envelope.dueDate && requestedDue < envelope.dueDate,
        );
        if (clampedStart || clampedEnd) {
          constraints.push({
            entityType: "project",
            entityId: project.id,
            startDate: envelope.startDate,
            dueDate: envelope.dueDate,
            requestedStartDate: requestedStart,
            requestedDueDate: requestedDue,
            clampedStart,
            clampedEnd,
            constrainingTaskIds: constrainingTaskIds(members, envelope),
          });
        }
        workingProjects.set(project.id, {
          ...project,
          startDate:
            envelope.startDate && requestedStart > envelope.startDate
              ? envelope.startDate
              : requestedStart,
          dueDate:
            envelope.dueDate && requestedDue < envelope.dueDate
              ? envelope.dueDate
              : requestedDue,
        });
      }
    }
  }

  // Every project is a minimum container. This also catches tasks moved by
  // cross-project dependency cascades.
  for (const project of workingProjects.values()) {
    const members = taskList().filter(
      (task) => task.projectId === project.id,
    );
    const expansion = expandContainerEnvelope(
      {
        id: project.id,
        startDate: project.startDate,
        dueDate: project.dueDate,
      },
      members,
    );
    workingProjects.set(project.id, {
      ...project,
      startDate: expansion.startDate,
      dueDate: expansion.dueDate,
    });
  }

  const parentIds = new Set(
    input.tasks
      .map((task) => task.parentTaskId)
      .filter((id): id is string => Boolean(id)),
  );
  const taskChanges: ScheduleEntityChange[] = input.tasks.flatMap((task) => {
    const before = originalTasks.get(task.id)!;
    const after = workingTasks.get(task.id)!;
    if (
      before.startDate === after.startDate &&
      before.dueDate === after.dueDate
    ) {
      return [];
    }
    const cause: ScheduleChangeCause =
      task.id === edit.entityId && edit.entityType === "task"
        ? edit.operation === "fit"
          ? "fit"
          : "direct"
        : subtreeTaskIds.has(task.id)
          ? "subtree"
          : parentIds.has(task.id) && isOutwardExpansion(before, after)
            ? "ancestor-expansion"
            : "dependency";
    return [{
      entityType: "task" as const,
      entityId: task.id,
      beforeStartDate: before.startDate,
      beforeDueDate: before.dueDate,
      afterStartDate: after.startDate,
      afterDueDate: after.dueDate,
      cause,
    }];
  });
  const projectChanges: ScheduleEntityChange[] = input.projects.flatMap(
    (project) => {
      const before = originalProjects.get(project.id)!;
      const after = workingProjects.get(project.id)!;
      if (
        before.startDate === after.startDate &&
        before.dueDate === after.dueDate
      ) {
        return [];
      }
      return [{
        entityType: "project" as const,
        entityId: project.id,
        beforeStartDate: before.startDate,
        beforeDueDate: before.dueDate,
        afterStartDate: after.startDate,
        afterDueDate: after.dueDate,
        cause:
          edit.entityType === "project" && edit.entityId === project.id
            ? edit.operation === "fit"
              ? "fit" as const
              : "direct" as const
            : "ancestor-expansion" as const,
      }];
    },
  );
  const changes = [...taskChanges, ...projectChanges];

  const directBefore =
    edit.entityType === "task"
      ? originalTasks.get(edit.entityId)
      : originalProjects.get(edit.entityId);
  const directAfter =
    edit.entityType === "task"
      ? workingTasks.get(edit.entityId)
      : workingProjects.get(edit.entityId);
  const dayDelta =
    directBefore?.startDate && directAfter?.startDate
      ? calendarDayDistance(directBefore.startDate, directAfter.startDate)
      : directBefore?.dueDate && directAfter?.dueDate
        ? calendarDayDistance(directBefore.dueDate, directAfter.dueDate)
        : 0;

  return {
    edit,
    changes,
    constraints,
    impact: {
      dayDelta,
      affectedTaskCount: taskChanges.length,
      affectedProjectCount: projectChanges.length,
      expandedTaskCount: taskChanges.filter(
        (change) => change.cause === "ancestor-expansion",
      ).length,
      expandedProjectCount: projectChanges.filter(
        (change) => change.cause === "ancestor-expansion",
      ).length,
      conflictTaskIds: [...dependencyConflicts(taskList(), input.dependencies)],
    },
  };
}
