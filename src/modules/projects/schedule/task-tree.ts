// Task hierarchy helpers: children, forests, ancestors/descendants, leaves,
// indent/outdent targets and hierarchy validation. Re-exported from ../schedule.ts.
import { ScheduleError } from "../schedule-errors";
import type { TaskSubtree, TaskTreeNode } from "./schedule-types";

export function taskChildren<T extends { id: string; parentTaskId?: string | null }>(
  tasks: T[],
  parentTaskId: string,
): T[] {
  return tasks.filter((task) => task.parentTaskId === parentTaskId);
}

export function buildTaskForest<
  T extends { id: string; parentTaskId?: string | null; sortOrder?: number },
>(tasks: T[]): TaskTreeNode<T>[] {
  const nodes = new Map<string, TaskTreeNode<T>>(
    tasks.map((task) => [task.id, { ...task, depth: 0, children: [] }]),
  );
  const roots: TaskTreeNode<T>[] = [];
  for (const task of tasks) {
    const node = nodes.get(task.id)!;
    const parent = task.parentTaskId ? nodes.get(task.parentTaskId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortAndDepth = (items: TaskTreeNode<T>[], depth: number) => {
    items.sort(
      (left, right) =>
        (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
        left.id.localeCompare(right.id),
    );
    for (const item of items) {
      item.depth = depth;
      sortAndDepth(item.children, depth + 1);
    }
  };
  sortAndDepth(roots, 0);
  return roots;
}

export function taskDescendants<
  T extends { id: string; parentTaskId?: string | null },
>(tasks: T[], taskId: string): T[] {
  const byParent = new Map<string, T[]>();
  for (const task of tasks) {
    if (!task.parentTaskId) continue;
    const siblings = byParent.get(task.parentTaskId) ?? [];
    siblings.push(task);
    byParent.set(task.parentTaskId, siblings);
  }
  const result: T[] = [];
  const queue = [...(byParent.get(taskId) ?? [])];
  while (queue.length > 0) {
    const next = queue.shift()!;
    result.push(next);
    queue.push(...(byParent.get(next.id) ?? []));
  }
  return result;
}

export function taskAncestors<
  T extends { id: string; parentTaskId?: string | null },
>(tasks: T[], taskId: string): T[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const result: T[] = [];
  const seen = new Set<string>([taskId]);
  let cursor = byId.get(taskId);
  while (cursor?.parentTaskId) {
    if (seen.has(cursor.parentTaskId)) throw new ScheduleError("cycle", "Task hierarchy cycle");
    seen.add(cursor.parentTaskId);
    const parent = byId.get(cursor.parentTaskId);
    if (!parent) break;
    result.push(parent);
    cursor = parent;
  }
  return result;
}

export function taskDepth<
  T extends { id: string; parentTaskId?: string | null },
>(tasks: T[], taskId: string): number {
  return taskAncestors(tasks, taskId).length;
}

export function taskSubtree<
  T extends { id: string; parentTaskId?: string | null },
>(tasks: T[], taskId: string): TaskSubtree<T> {
  const root = tasks.find((task) => task.id === taskId);
  if (!root) throw new ScheduleError("not-found", "Task not found");
  const descendants = taskDescendants(tasks, taskId);
  return { root, descendants, leaves: leafTasks([root, ...descendants]) };
}

export function leafTasks<T extends { id: string; parentTaskId?: string | null }>(
  tasks: T[],
): T[] {
  const parentIds = new Set(
    tasks
      .map((task) => task.parentTaskId)
      .filter((parentTaskId): parentTaskId is string => Boolean(parentTaskId)),
  );
  return tasks.filter((task) => !parentIds.has(task.id));
}

/**
 * The task a row would be nested under when indented (R5): its nearest preceding
 * sibling. Returns null when the row is already first among its siblings, or
 * when that sibling is a milestone and so cannot hold subtasks.
 */
export function indentTarget<
  T extends { id: string; parentTaskId?: string | null; sortOrder?: number; isMilestone?: boolean },
>(tasks: T[], taskId: string): T | null {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task) return null;
  // Callers pass the same deterministic order used to render the tree. Keeping
  // that order matters because sortOrder is scoped to a Kanban column, so equal
  // and overlapping values across columns are expected.
  const siblings = tasks.filter(
    (candidate) =>
      (candidate.parentTaskId ?? null) === (task.parentTaskId ?? null),
  );
  const index = siblings.findIndex((candidate) => candidate.id === taskId);
  if (index <= 0) return null;
  const previous = siblings[index - 1];
  return previous.isMilestone ? null : previous;
}

/**
 * The parent a row would move to when outdented (R5): its grandparent, or null
 * for the project root. Returns undefined when the row is already at the root
 * and cannot be outdented any further.
 */
export function outdentTarget<
  T extends { id: string; parentTaskId?: string | null },
>(tasks: T[], taskId: string): string | null | undefined {
  const task = tasks.find((candidate) => candidate.id === taskId);
  if (!task?.parentTaskId) return undefined;
  const parent = tasks.find((candidate) => candidate.id === task.parentTaskId);
  return parent?.parentTaskId ?? null;
}

export function assertTaskHierarchy<
  T extends { id: string; projectId: string; parentTaskId?: string | null; isMilestone?: boolean },
>(tasks: T[], task: T): void {
  if (!task.parentTaskId) return;
  const parent = tasks.find((candidate) => candidate.id === task.parentTaskId);
  if (!parent) throw new ScheduleError("not-found", "Parent task not found");
  if (parent.projectId !== task.projectId) throw new ScheduleError("hierarchy", "Parent task belongs to another project");
  if (parent.isMilestone) throw new ScheduleError("hierarchy", "Milestones cannot contain subtasks");
  if (parent.id === task.id) throw new ScheduleError("hierarchy", "A task cannot be its own parent");
  const descendants = taskDescendants(tasks, task.id);
  if (descendants.some((descendant) => descendant.id === parent.id)) {
    throw new ScheduleError("cycle", "Task hierarchy cycle");
  }
}
