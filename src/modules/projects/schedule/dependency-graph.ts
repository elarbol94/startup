// Dependency link semantics and graph analysis: endpoint dates, cycle detection,
// endpoint validation, conflicts and the critical path. Re-exported from ../schedule.ts.
import { ScheduleError } from "../schedule-errors";
import type {
  DependencyType,
  ScheduleDependency,
  ScheduleDependencyLike,
  ScheduleTask,
} from "./schedule-types";
import { addCalendarDays, calendarDaysInclusive } from "./date-math";
import { taskAncestors } from "./task-tree";

export function dependencyStartDate(
  predecessorDueDate: string,
  lagDays: number,
): string {
  return addCalendarDays(predecessorDueDate, lagDays + 1);
}

export function dependencyTypeOf(
  dependency: Pick<ScheduleDependencyLike, "dependencyType">,
): DependencyType {
  return dependency.dependencyType ?? "finish_to_start";
}

export function dependencyEndpoints(
  dependency: Pick<ScheduleDependencyLike, "dependencyType">,
): {
  predecessor: "start" | "finish";
  successor: "start" | "finish";
} {
  switch (dependencyTypeOf(dependency)) {
    case "start_to_start":
      return { predecessor: "start", successor: "start" };
    case "finish_to_finish":
      return { predecessor: "finish", successor: "finish" };
    case "start_to_finish":
      return { predecessor: "start", successor: "finish" };
    default:
      return { predecessor: "finish", successor: "start" };
  }
}

/**
 * Returns the earliest permitted successor endpoint. Finish-to-start adds one
 * day because task ranges are inclusive; every other relationship compares its
 * endpoint dates directly.
 */
export function dependencyRequiredDate(
  predecessor: Pick<ScheduleTask, "startDate" | "dueDate">,
  dependency: Pick<ScheduleDependencyLike, "dependencyType" | "lagDays">,
): string | null {
  const endpoints = dependencyEndpoints(dependency);
  const predecessorDate =
    endpoints.predecessor === "start"
      ? predecessor.startDate
      : predecessor.dueDate;
  if (!predecessorDate) return null;
  const offset =
    dependencyTypeOf(dependency) === "finish_to_start"
      ? dependency.lagDays + 1
      : dependency.lagDays;
  return addCalendarDays(predecessorDate, offset);
}

export function pushEdge(
  edges: Map<string, string[]>,
  from: string,
  to: string,
): void {
  const existing = edges.get(from);
  if (existing) existing.push(to);
  else edges.set(from, [to]);
}

/**
 * Builds the constraint graph used for cycle detection.
 *
 * Each task contributes two nodes — its start and its finish — so that summary
 * rollup can be expressed as ordinary edges instead of a special case:
 *
 * - `start → finish` for every task (a task cannot finish before it starts)
 * - `child:finish → parent:finish` and `parent:start → child:start`, because a
 *   parent spans exactly its children
 * - `predecessor:finish → successor:start` for every dependency
 *
 * A cycle in this graph is precisely a set of constraints that cannot all hold.
 * Linking a summary to one of its own subtasks produces one, and so does the
 * subtler case where a subtask precedes a task that in turn precedes the
 * subtask's own parent.
 */
function buildConstraintGraph(
  tasks: { id: string; parentTaskId?: string | null }[],
  dependencies: ScheduleDependencyLike[],
): { nodes: string[]; edges: Map<string, string[]> } {
  const ids = new Set(tasks.map((task) => task.id));
  const nodes: string[] = [];
  const edges = new Map<string, string[]>();
  for (const task of tasks) {
    nodes.push(`${task.id}:start`, `${task.id}:finish`);
    pushEdge(edges, `${task.id}:start`, `${task.id}:finish`);
  }
  for (const task of tasks) {
    if (!task.parentTaskId || !ids.has(task.parentTaskId)) continue;
    pushEdge(edges, `${task.id}:finish`, `${task.parentTaskId}:finish`);
    pushEdge(edges, `${task.parentTaskId}:start`, `${task.id}:start`);
  }
  for (const dependency of dependencies) {
    if (!ids.has(dependency.predecessorTaskId) || !ids.has(dependency.successorTaskId)) {
      continue;
    }
    const endpoints = dependencyEndpoints(dependency);
    pushEdge(
      edges,
      `${dependency.predecessorTaskId}:${endpoints.predecessor}`,
      `${dependency.successorTaskId}:${endpoints.successor}`,
    );
  }
  return { nodes, edges };
}

export function hasScheduleCycle(
  tasks: { id: string; parentTaskId?: string | null }[],
  dependencies: ScheduleDependencyLike[],
): boolean {
  const { nodes, edges } = buildConstraintGraph(tasks, dependencies);
  const indegree = new Map(nodes.map((node) => [node, 0]));
  for (const targets of edges.values()) {
    for (const target of targets) {
      indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
  }
  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([node]) => node);
  let visited = 0;
  while (queue.length > 0) {
    const node = queue.shift()!;
    visited += 1;
    for (const next of edges.get(node) ?? []) {
      const degree = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, degree);
      if (degree === 0) queue.push(next);
    }
  }
  if (visited !== nodes.length) return true;

  // The cascade planner settles whole task ranges in dependency order. A mixed
  // endpoint loop can be mathematically feasible at node level while still
  // leaving no stable whole-task order, so reject that ambiguous authoring
  // pattern as a cycle as well.
  const taskIds = new Set(tasks.map((task) => task.id));
  const taskOutgoing = new Map<string, string[]>();
  const taskIndegree = new Map(tasks.map((task) => [task.id, 0]));
  for (const dependency of dependencies) {
    if (
      !taskIds.has(dependency.predecessorTaskId) ||
      !taskIds.has(dependency.successorTaskId)
    ) {
      continue;
    }
    pushEdge(
      taskOutgoing,
      dependency.predecessorTaskId,
      dependency.successorTaskId,
    );
    taskIndegree.set(
      dependency.successorTaskId,
      (taskIndegree.get(dependency.successorTaskId) ?? 0) + 1,
    );
  }
  const taskQueue = [...taskIndegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([id]) => id);
  let taskVisited = 0;
  while (taskQueue.length > 0) {
    const id = taskQueue.shift()!;
    taskVisited += 1;
    for (const next of taskOutgoing.get(id) ?? []) {
      const degree = (taskIndegree.get(next) ?? 0) - 1;
      taskIndegree.set(next, degree);
      if (degree === 0) taskQueue.push(next);
    }
  }
  return taskVisited !== tasks.length;
}

/**
 * Rejects dependencies whose endpoints sit on the same branch of the tree.
 * `hasScheduleCycle` catches these too, but only after the fact and with a
 * generic message; this produces one the user can act on.
 */
export function assertDependencyEndpoints<
  T extends { id: string; parentTaskId?: string | null },
>(tasks: T[], dependency: Pick<ScheduleDependency, "predecessorTaskId" | "successorTaskId">): void {
  if (dependency.predecessorTaskId === dependency.successorTaskId) {
    throw new ScheduleError("hierarchy", "A task cannot depend on itself");
  }
  const relatedByHierarchy =
    taskAncestors(tasks, dependency.successorTaskId).some(
      (ancestor) => ancestor.id === dependency.predecessorTaskId,
    ) ||
    taskAncestors(tasks, dependency.predecessorTaskId).some(
      (ancestor) => ancestor.id === dependency.successorTaskId,
    );
  if (relatedByHierarchy) {
    throw new ScheduleError("hierarchy", "A summary task cannot depend on its own subtasks");
  }
}

export function dependencyConflicts(
  tasks: ScheduleTask[],
  dependencies: ScheduleDependencyLike[],
): Set<string> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const conflicts = new Set<string>();
  for (const dependency of dependencies) {
    const predecessor = byId.get(dependency.predecessorTaskId);
    const successor = byId.get(dependency.successorTaskId);
    if (!predecessor || !successor) continue;
    const requiredDate = dependencyRequiredDate(predecessor, dependency);
    const endpoints = dependencyEndpoints(dependency);
    const actualDate =
      endpoints.successor === "start"
        ? successor.startDate
        : successor.dueDate;
    if (requiredDate && actualDate && actualDate < requiredDate) {
      conflicts.add(successor.id);
    }
  }
  return conflicts;
}

export function dependencyConflictEdgeKeys(
  tasks: ScheduleTask[],
  dependencies: ScheduleDependencyLike[],
): Set<string> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const conflicts = new Set<string>();
  for (const dependency of dependencies) {
    const predecessor = byId.get(dependency.predecessorTaskId);
    const successor = byId.get(dependency.successorTaskId);
    if (!predecessor || !successor) continue;
    const requiredDate = dependencyRequiredDate(predecessor, dependency);
    const endpoints = dependencyEndpoints(dependency);
    const actualDate =
      endpoints.successor === "start"
        ? successor.startDate
        : successor.dueDate;
    if (requiredDate && actualDate && actualDate < requiredDate) {
      conflicts.add(
        dependency.id ??
          `${dependency.predecessorTaskId}:${dependency.successorTaskId}:${dependencyTypeOf(dependency)}:${dependency.lagDays}`,
      );
    }
  }
  return conflicts;
}

export function criticalPathTaskIds(
  tasks: ScheduleTask[],
  dependencies: ScheduleDependencyLike[],
): Set<string> {
  if (hasScheduleCycle(tasks, dependencies)) return new Set();
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const incoming = new Map<string, ScheduleDependencyLike[]>();
  const outgoing = new Map<string, string[]>();
  const indegree = new Map(tasks.map((task) => [task.id, 0]));
  for (const dependency of dependencies) {
    if (!byId.has(dependency.predecessorTaskId) || !byId.has(dependency.successorTaskId)) continue;
    const existingIncoming = incoming.get(dependency.successorTaskId);
    if (existingIncoming) existingIncoming.push(dependency);
    else incoming.set(dependency.successorTaskId, [dependency]);
    pushEdge(outgoing, dependency.predecessorTaskId, dependency.successorTaskId);
    indegree.set(dependency.successorTaskId, (indegree.get(dependency.successorTaskId) ?? 0) + 1);
  }
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([id]) => id);
  const distance = new Map<string, number>();
  const previous = new Map<string, string | null>();
  let endId: string | null = null;
  while (queue.length > 0) {
    const id = queue.shift()!;
    const task = byId.get(id)!;
    const weight =
      task.startDate && task.dueDate
        ? Math.max(1, calendarDaysInclusive(task.startDate, task.dueDate))
        : 1;
    let bestDistance = 0;
    let bestPrevious: string | null = null;
    for (const dependency of incoming.get(id) ?? []) {
      const predecessorId = dependency.predecessorTaskId;
      const predecessor = byId.get(predecessorId);
      if (!predecessor) continue;
      const predecessorDuration =
        predecessor.startDate && predecessor.dueDate
          ? Math.max(
              1,
              calendarDaysInclusive(
                predecessor.startDate,
                predecessor.dueDate,
              ),
            )
          : 1;
      const type = dependencyTypeOf(dependency);
      const edgeOffset =
        type === "finish_to_start"
          ? predecessorDuration + dependency.lagDays
          : type === "start_to_start"
            ? dependency.lagDays
            : type === "finish_to_finish"
              ? predecessorDuration - weight + dependency.lagDays
              : 1 - weight + dependency.lagDays;
      const candidate = (distance.get(predecessorId) ?? 0) + edgeOffset;
      if (candidate > bestDistance) {
        bestDistance = candidate;
        bestPrevious = predecessorId;
      }
    }
    distance.set(id, bestDistance);
    previous.set(id, bestPrevious);
    const finishDistance = bestDistance + weight;
    const currentEnd = endId ? byId.get(endId) : null;
    const currentEndDistance = endId
      ? (distance.get(endId) ?? 0) +
        (currentEnd?.startDate && currentEnd.dueDate
          ? Math.max(
              1,
              calendarDaysInclusive(
                currentEnd.startDate,
                currentEnd.dueDate,
              ),
            )
          : 1)
      : Number.NEGATIVE_INFINITY;
    if (endId === null || finishDistance > currentEndDistance) {
      endId = id;
    }
    for (const successorId of outgoing.get(id) ?? []) {
      const degree = (indegree.get(successorId) ?? 0) - 1;
      indegree.set(successorId, degree);
      if (degree === 0) queue.push(successorId);
    }
  }
  const result = new Set<string>();
  while (endId) {
    result.add(endId);
    endId = previous.get(endId) ?? null;
  }
  return result;
}
