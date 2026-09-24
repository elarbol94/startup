// Summary/project container maths: progress and date rollups, envelopes, containment
// checks, subtree shifting and placement suggestions. Re-exported from ../schedule.ts.
import type {
  AncestorExpansion,
  PlacementSuggestion,
  ScheduleConstraint,
  ScheduleContainmentViolation,
  SchedulePortfolioTask,
  ScheduleProject,
  ScheduleRollup,
  ScheduleTask,
} from "./schedule-types";
import {
  addCalendarDays,
  calendarDaysInclusive,
  dueDateForDuration,
  parseIsoDate,
  toIsoDate,
} from "./date-math";
import { taskDescendants } from "./task-tree";

export function constrainingTaskIds(
  tasks: SchedulePortfolioTask[],
  envelope: { startDate: string | null; dueDate: string | null },
): string[] {
  return tasks
    .filter(
      (task) =>
        (envelope.startDate && task.startDate === envelope.startDate) ||
        (envelope.dueDate && task.dueDate === envelope.dueDate),
    )
    .map((task) => task.id);
}

export function weightedProgress(tasks: ScheduleTask[]): number {
  if (tasks.length === 0) return 0;
  let weighted = 0;
  let weightTotal = 0;
  for (const task of tasks) {
    const weight =
      task.isMilestone
        ? 1
        : task.startDate && task.dueDate
          ? Math.max(1, calendarDaysInclusive(task.startDate, task.dueDate))
          : 1;
    weighted += Math.min(100, Math.max(0, task.progress ?? 0)) * weight;
    weightTotal += weight;
  }
  return Math.round(weighted / weightTotal);
}

export function shiftScheduledTasks<
  T extends Pick<ScheduleTask, "startDate" | "dueDate">,
>(tasks: T[], dayOffset: number): T[] {
  return tasks.map((task) =>
    task.startDate && task.dueDate
      ? {
          ...task,
          startDate: addCalendarDays(task.startDate, dayOffset),
          dueDate: addCalendarDays(task.dueDate, dayOffset),
        }
      : { ...task },
  );
}

export function descendantEnvelope(
  tasks: Pick<ScheduleTask, "startDate" | "dueDate">[],
): { startDate: string | null; dueDate: string | null } {
  const starts = tasks
    .map((task) => task.startDate)
    .filter((value): value is string => Boolean(value));
  const finishes = tasks
    .map((task) => task.dueDate)
    .filter((value): value is string => Boolean(value));
  return {
    startDate: starts.length ? starts.sort()[0] : null,
    dueDate: finishes.length ? finishes.sort().at(-1)! : null,
  };
}

/**
 * Validates the minimum-container invariant for an already-materialized
 * portfolio. It is used before undo so a historic date snapshot cannot be
 * restored into a tree that gained new descendants in the meantime.
 */
export function scheduleContainmentViolations(
  tasks: SchedulePortfolioTask[],
  projects: ScheduleProject[],
): ScheduleContainmentViolation[] {
  const violations: ScheduleContainmentViolation[] = [];
  const parentIds = new Set(
    tasks
      .map((task) => task.parentTaskId)
      .filter((id): id is string => Boolean(id)),
  );
  for (const parentId of parentIds) {
    const parent = tasks.find((task) => task.id === parentId);
    if (!parent) continue;
    const descendants = taskDescendants(tasks, parent.id);
    const envelope = descendantEnvelope(descendants);
    const violatesStart = Boolean(
      envelope.startDate &&
        (!parent.startDate || parent.startDate > envelope.startDate),
    );
    const violatesEnd = Boolean(
      envelope.dueDate &&
        (!parent.dueDate || parent.dueDate < envelope.dueDate),
    );
    if (violatesStart || violatesEnd) {
      violations.push({
        entityType: "task",
        entityId: parent.id,
        violatesStart,
        violatesEnd,
        constrainingTaskIds: constrainingTaskIds(descendants, envelope),
      });
    }
  }
  for (const project of projects) {
    const members = tasks.filter((task) => task.projectId === project.id);
    const envelope = descendantEnvelope(members);
    const violatesStart = Boolean(
      envelope.startDate &&
        (!project.startDate || project.startDate > envelope.startDate),
    );
    const violatesEnd = Boolean(
      envelope.dueDate &&
        (!project.dueDate || project.dueDate < envelope.dueDate),
    );
    if (violatesStart || violatesEnd) {
      violations.push({
        entityType: "project",
        entityId: project.id,
        violatesStart,
        violatesEnd,
        constrainingTaskIds: constrainingTaskIds(members, envelope),
      });
    }
  }
  return violations;
}

/**
 * Widens a container just enough to contain its scheduled children. Authored
 * slack is retained and unscheduled children do not constrain either edge.
 */
export function expandContainerEnvelope(
  container: Pick<ScheduleTask, "id" | "startDate" | "dueDate">,
  children: Pick<ScheduleTask, "startDate" | "dueDate">[],
): AncestorExpansion {
  const envelope = descendantEnvelope(children);
  const startDate =
    envelope.startDate &&
    (!container.startDate || envelope.startDate < container.startDate)
      ? envelope.startDate
      : container.startDate;
  const dueDate =
    envelope.dueDate &&
    (!container.dueDate || envelope.dueDate > container.dueDate)
      ? envelope.dueDate
      : container.dueDate;
  return {
    taskId: container.id,
    startDate,
    dueDate,
    expandedStart: startDate !== container.startDate,
    expandedEnd: dueDate !== container.dueDate,
  };
}

/** @deprecated Use `expandContainerEnvelope`; retained for existing callers. */
export const rollupEnvelope = expandContainerEnvelope;

/**
 * How far work reaches outside a container. The same envelope powers resize
 * clamping and the UI's explanatory constraint indicator.
 */
export function containerOverflow(
  container: Pick<ScheduleTask, "startDate" | "dueDate">,
  children: Pick<ScheduleTask, "startDate" | "dueDate">[],
): ScheduleConstraint {
  const envelope = descendantEnvelope(children);
  const overflowsStart = Boolean(
    container.startDate && envelope.startDate && envelope.startDate < container.startDate,
  );
  const overflowsEnd = Boolean(
    container.dueDate && envelope.dueDate && envelope.dueDate > container.dueDate,
  );
  return {
    startDate: envelope.startDate,
    dueDate: envelope.dueDate,
    clampedStart: overflowsStart,
    clampedEnd: overflowsEnd,
  };
}

export function suggestTaskPlacement(input: {
  today: string;
  parent?: Pick<ScheduleTask, "startDate" | "dueDate"> | null;
  siblings: Pick<ScheduleTask, "startDate" | "dueDate">[];
  days?: number;
}): PlacementSuggestion {
  const duration = Math.max(1, Math.round(input.days ?? 5));
  const parentStart = input.parent?.startDate
    ? toIsoDate(parseIsoDate(input.parent.startDate))
    : null;
  const parentDue = input.parent?.dueDate
    ? toIsoDate(parseIsoDate(input.parent.dueDate))
    : null;
  const ranges = input.siblings
    .filter(
      (task): task is { startDate: string; dueDate: string } =>
        Boolean(task.startDate && task.dueDate),
    )
    .map((task) => ({
      startDate: toIsoDate(parseIsoDate(task.startDate)),
      dueDate: toIsoDate(parseIsoDate(task.dueDate)),
    }))
    .sort((left, right) => left.startDate.localeCompare(right.startDate));
  let cursor = parentStart ?? toIsoDate(parseIsoDate(input.today));
  for (const range of ranges) {
    const candidateDue = dueDateForDuration(cursor, duration);
    if (candidateDue < range.startDate && (!parentDue || candidateDue <= parentDue)) {
      return {
        startDate: cursor,
        dueDate: candidateDue,
        expandsAncestors: false,
        reason: "free-gap",
      };
    }
    if (range.dueDate >= cursor) cursor = addCalendarDays(range.dueDate, 1);
  }
  const dueDate = dueDateForDuration(cursor, duration);
  const expandsAncestors = Boolean(parentDue && dueDate > parentDue);
  return {
    startDate: cursor,
    dueDate,
    expandsAncestors,
    reason: ranges.length ? "after-siblings" : parentStart ? "free-gap" : "near-today",
  };
}

export function rollupTaskSchedule(children: ScheduleTask[]): ScheduleRollup {
  const starts = children
    .map((task) => task.startDate)
    .filter((value): value is string => Boolean(value))
    .sort();
  const finishes = children
    .map((task) => task.dueDate)
    .filter((value): value is string => Boolean(value))
    .sort();
  return {
    startDate: starts[0] ?? null,
    dueDate: finishes.at(-1) ?? null,
    progress: weightedProgress(children),
    unscheduledCount: children.filter((task) => !task.startDate || !task.dueDate).length,
  };
}
