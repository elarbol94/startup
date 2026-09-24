// Task-level cascade planner: applies a root task edit and settles dependencies and
// summary rollups to a fixed point. Used by edit-preview.ts; re-exported from ../schedule.ts.
import { ScheduleError } from "../schedule-errors";
import type {
  ScheduleChange,
  ScheduleDependencyLike,
  ScheduleOperation,
  ScheduleTask,
} from "./schedule-types";
import {
  addCalendarDays,
  calendarDayDistance,
  calendarDaysInclusive,
  dueDateForDuration,
  parseIsoDate,
  toIsoDate,
} from "./date-math";
import {
  dependencyEndpoints,
  dependencyRequiredDate,
  hasScheduleCycle,
  pushEdge,
} from "./dependency-graph";
import { taskAncestors, taskDescendants } from "./task-tree";
import { descendantEnvelope, expandContainerEnvelope } from "./container-rollups";

/**
 * The earliest start every predecessor allows, or null when the task has no
 * predecessor with a finish date.
 */
function dependencyFloor(
  taskId: string,
  tasks: Map<string, ScheduleTask>,
  dependencies: ScheduleDependencyLike[],
): string | null {
  let latest: string | null = null;
  for (const dependency of dependencies) {
    if (dependency.successorTaskId !== taskId) continue;
    const predecessor = tasks.get(dependency.predecessorTaskId);
    const successor = tasks.get(taskId);
    if (!predecessor || !successor?.startDate || !successor.dueDate) continue;
    const requiredDate = dependencyRequiredDate(predecessor, dependency);
    if (!requiredDate) continue;
    const constraint =
      dependencyEndpoints(dependency).successor === "start"
        ? requiredDate
        : addCalendarDays(
            requiredDate,
            -(Math.max(
              1,
              calendarDaysInclusive(successor.startDate, successor.dueDate),
            ) - 1),
          );
    if (latest === null || constraint > latest) latest = constraint;
  }
  return latest;
}

/**
 * Where a dependent task wants to start, given what its predecessors allow and
 * the constraint it carries. Returns null when the task should stay put.
 */
function constrainedStart(
  task: ScheduleTask,
  floor: string | null,
  originalStart: string | null,
): string | null {
  const constraintType = task.constraintType ?? "asap";
  if (constraintType === "must_start_on") {
    return task.constraintDate ? toIsoDate(parseIsoDate(task.constraintDate)) : null;
  }
  if (!floor) return null;
  if (constraintType === "start_no_earlier_than") {
    const anchor = task.constraintDate ?? originalStart;
    if (!anchor) return floor;
    const normalizedAnchor = toIsoDate(parseIsoDate(anchor));
    return floor > normalizedAnchor ? floor : normalizedAnchor;
  }
  return floor;
}

function directChildren<T extends { id: string; parentTaskId?: string | null }>(
  tasks: T[],
): Map<string, T[]> {
  const byParent = new Map<string, T[]>();
  for (const task of tasks) {
    if (!task.parentTaskId) continue;
    const siblings = byParent.get(task.parentTaskId);
    if (siblings) siblings.push(task);
    else byParent.set(task.parentTaskId, [task]);
  }
  return byParent;
}

function dependencyOrder(
  tasks: ScheduleTask[],
  dependencies: ScheduleDependencyLike[],
): string[] {
  const ids = new Set(tasks.map((task) => task.id));
  const outgoing = new Map<string, string[]>();
  const indegree = new Map(tasks.map((task) => [task.id, 0]));
  for (const dependency of dependencies) {
    if (!ids.has(dependency.predecessorTaskId) || !ids.has(dependency.successorTaskId)) {
      continue;
    }
    pushEdge(outgoing, dependency.predecessorTaskId, dependency.successorTaskId);
    indegree.set(
      dependency.successorTaskId,
      (indegree.get(dependency.successorTaskId) ?? 0) + 1,
    );
  }
  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }
  return order;
}

/**
 * Expands every summary above changed work, deepest first. Existing slack is
 * deliberately preserved: moving descendants inward never shrinks a container.
 */
function rollupAncestorsInPlace(
  working: Map<string, ScheduleTask>,
  childrenByParent: Map<string, ScheduleTask[]>,
  depthById: Map<string, number>,
  taskIds: Iterable<string>,
): void {
  const pending = new Set<string>();
  for (const taskId of taskIds) {
    let cursor = working.get(taskId)?.parentTaskId ?? null;
    const seen = new Set<string>();
    while (cursor && !seen.has(cursor)) {
      seen.add(cursor);
      pending.add(cursor);
      cursor = working.get(cursor)?.parentTaskId ?? null;
    }
  }
  const deepestFirst = [...pending].sort(
    (left, right) => (depthById.get(right) ?? 0) - (depthById.get(left) ?? 0),
  );
  for (const parentId of deepestFirst) {
    const parent = working.get(parentId);
    if (!parent) continue;
    const children = (childrenByParent.get(parentId) ?? []).map(
      (child) => working.get(child.id) ?? child,
    );
    if (children.length === 0) continue;
    const expansion = expandContainerEnvelope(parent, children);
    working.set(parentId, {
      ...parent,
      startDate: expansion.startDate,
      dueDate: expansion.dueDate,
    });
  }
}

/**
 * Resolves a schedule edit into the full set of date changes it implies.
 *
 * The root edit is applied first — moving a summary shifts its whole subtree
 * rigidly (R2) — and then dependencies and summary rollups are settled to a
 * fixed point. Successors are both pushed later and, when they are `asap`,
 * pulled earlier (R7). Summary tasks may sit at either end of a dependency
 * (R6); a link into one shifts that subtree and leaves its internals intact.
 */
export function previewScheduleCascade(
  sourceTasks: ScheduleTask[],
  dependencies: ScheduleDependencyLike[],
  rootChange: {
    taskId: string;
    startDate?: string | null;
    dueDate?: string | null;
    operation?: ScheduleOperation;
    rigidTaskIds?: string[];
  },
): ScheduleChange[] {
  if (hasScheduleCycle(sourceTasks, dependencies)) {
    throw new ScheduleError("cycle", "Dependency cycle");
  }
  const original = new Map(sourceTasks.map((task) => [task.id, task]));
  const working = new Map(sourceTasks.map((task) => [task.id, { ...task }]));
  const root = working.get(rootChange.taskId);
  if (!root) throw new ScheduleError("not-found", "Task not found");

  const childrenByParent = directChildren(sourceTasks);
  const depthById = new Map(
    sourceTasks.map((task) => [task.id, taskAncestors(sourceTasks, task.id).length]),
  );
  const descendantsById = new Map(
    sourceTasks
      .filter((task) => childrenByParent.has(task.id))
      .map((task) => [task.id, taskDescendants(sourceTasks, task.id)]),
  );
  const touched = new Set<string>();
  // A moved summary is a rigid schedule block for this edit. Dependencies may
  // move work downstream of it, but may not snap one of its descendants back to
  // an old constraint anchor and deform the subtree.
  const rigidTaskIds = new Set(rootChange.rigidTaskIds ?? []);

  const moveTask = (taskId: string, startDate: string): void => {
    const task = working.get(taskId);
    if (!task) return;
    const descendants = descendantsById.get(taskId);
    if (descendants && descendants.length > 0) {
      const envelope = descendantEnvelope(descendants);
      const currentStart = task.startDate ?? envelope.startDate;
      if (!currentStart) return;
      const offset = calendarDayDistance(currentStart, startDate);
      if (offset === 0) return;
      for (const member of [
        task,
        ...descendants.map((child) => working.get(child.id)!),
      ]) {
        rigidTaskIds.add(member.id);
        if (!member.startDate || !member.dueDate) continue;
        working.set(member.id, {
          ...member,
          startDate: addCalendarDays(member.startDate, offset),
          dueDate: addCalendarDays(member.dueDate, offset),
        });
        touched.add(member.id);
      }
      return;
    }
    if (!task.startDate || !task.dueDate) return;
    const duration = task.isMilestone
      ? 1
      : Math.max(1, calendarDaysInclusive(task.startDate, task.dueDate));
    working.set(taskId, {
      ...task,
      startDate,
      dueDate: task.isMilestone ? startDate : dueDateForDuration(startDate, duration),
    });
    touched.add(taskId);
  };

  const rootDescendants = descendantsById.get(root.id);
  const operation = rootChange.operation ?? "move";
  if (operation === "fit") {
    if (!rootDescendants || rootDescendants.length === 0) {
      throw new ScheduleError("invalid", "Only a task with children can be fitted");
    }
    const envelope = descendantEnvelope(
      rootDescendants.map((task) => working.get(task.id)!),
    );
    if (!envelope.startDate || !envelope.dueDate) {
      throw new ScheduleError("invalid", "Schedule at least one child before fitting the task");
    }
    working.set(root.id, {
      ...root,
      startDate: envelope.startDate,
      dueDate: envelope.dueDate,
    });
    touched.add(root.id);
  } else {
    if (!rootChange.startDate || !rootChange.dueDate) {
      throw new ScheduleError("invalid", "Schedule dates are required");
    }
    const normalizedStart = toIsoDate(parseIsoDate(rootChange.startDate));
    const normalizedDue = root.isMilestone
      ? normalizedStart
      : toIsoDate(parseIsoDate(rootChange.dueDate));
    if (normalizedDue < normalizedStart) {
      throw new ScheduleError("invalid", "Due date precedes start date");
    }
    if (
      operation === "move" &&
      rootDescendants &&
      rootDescendants.length > 0
    ) {
      moveTask(root.id, normalizedStart);
    } else if (rootDescendants && rootDescendants.length > 0) {
      const descendants = rootDescendants.map(
        (task) => working.get(task.id)!,
      );
      const envelope = descendantEnvelope(descendants);
      const requestedStart =
        operation === "resize-end"
          ? root.startDate ?? normalizedStart
          : normalizedStart;
      const requestedDue =
        operation === "resize-start"
          ? root.dueDate ?? normalizedDue
          : normalizedDue;
      const clampedStart =
        envelope.startDate && requestedStart > envelope.startDate
          ? envelope.startDate
          : requestedStart;
      const clampedDue =
        envelope.dueDate && requestedDue < envelope.dueDate
          ? envelope.dueDate
          : requestedDue;
      working.set(root.id, {
        ...root,
        startDate: clampedStart,
        dueDate: clampedDue,
      });
      touched.add(root.id);
    } else {
      working.set(root.id, {
        ...root,
        startDate: normalizedStart,
        dueDate: normalizedDue,
      });
      touched.add(root.id);
    }
  }

  const order = dependencyOrder(sourceTasks, dependencies);
  const successorIds = new Set(dependencies.map((dependency) => dependency.successorTaskId));
  const limit = sourceTasks.length + 2;
  let settled = false;
  for (let pass = 0; pass < limit && !settled; pass += 1) {
    settled = true;
    rollupAncestorsInPlace(working, childrenByParent, depthById, touched);
    for (const taskId of order) {
      if (!successorIds.has(taskId)) continue;
      if (rigidTaskIds.has(taskId)) continue;
      const task = working.get(taskId);
      if (!task?.startDate) continue;
      const desired = constrainedStart(
        task,
        dependencyFloor(taskId, working, dependencies),
        original.get(taskId)?.startDate ?? null,
      );
      if (!desired || desired === task.startDate) continue;
      moveTask(taskId, desired);
      settled = false;
    }
  }
  if (!settled) throw new ScheduleError("cycle", "Dependency cycle");
  rollupAncestorsInPlace(working, childrenByParent, depthById, touched);

  const changes: ScheduleChange[] = [];
  for (const [taskId, task] of working) {
    const before = original.get(taskId)!;
    if (before.startDate !== task.startDate || before.dueDate !== task.dueDate) {
      changes.push({
        taskId,
        beforeStartDate: before.startDate,
        beforeDueDate: before.dueDate,
        afterStartDate: task.startDate,
        afterDueDate: task.dueDate,
      });
    }
  }
  return changes;
}
