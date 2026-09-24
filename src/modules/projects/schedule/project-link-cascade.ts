// Project-level link cascade: pushes project/task successors of project links after
// a schedule edit, reusing the edit planner. Re-exported from ../schedule.ts.
import { ScheduleError } from "../schedule-errors";
import type {
  ScheduleChangeCause,
  ScheduleEntityChange,
  ScheduleEntityType,
  SchedulePlanInput,
  SchedulePreview,
} from "./schedule-types";
import { addCalendarDays, calendarDayDistance } from "./date-math";
import { dependencyConflicts } from "./dependency-graph";
import { previewScheduleEdit } from "./edit-preview";

/**
 * A finish-to-start link from a project or task to a whole project, or from a
 * project to a task (`project_dependencies` and `project_task_dependencies`).
 */
export type ProjectScheduleLink = {
  predecessorType: "project" | "task";
  predecessorId: string;
  successorType: "project" | "task";
  successorId: string;
};

/**
 * Pushes project-level successors after a schedule edit. Whenever the finish
 * of a linked predecessor moved, a successor that now starts on or before that
 * finish is moved to the day after it, using the same planner as a timeline
 * move so its subtree, task dependencies and containers follow. The result
 * lists every change once, with before values from the original input, so the
 * whole push is recorded in one change set and undone together.
 */
export function applyProjectLinkCascade(
  input: SchedulePlanInput & {
    links: ProjectScheduleLink[];
    preview: SchedulePreview;
  },
): SchedulePreview {
  if (input.links.length === 0) return input.preview;
  const tasks = new Map(input.tasks.map((task) => [task.id, { ...task }]));
  const projects = new Map(
    input.projects.map((project) => [project.id, { ...project }]),
  );
  const keyOf = (type: ScheduleEntityType, id: string) => `${type}:${id}`;
  const causes = new Map<string, ScheduleChangeCause>();
  const apply = (changes: ScheduleEntityChange[]) => {
    for (const change of changes) {
      const key = keyOf(change.entityType, change.entityId);
      if (!causes.has(key)) causes.set(key, change.cause);
      const dates = {
        startDate: change.afterStartDate,
        dueDate: change.afterDueDate,
      };
      if (change.entityType === "task") {
        const task = tasks.get(change.entityId);
        if (task) tasks.set(task.id, { ...task, ...dates });
      } else {
        const project = projects.get(change.entityId);
        if (project) projects.set(project.id, { ...project, ...dates });
      }
    }
  };
  const finishMoved = (changes: ScheduleEntityChange[]) =>
    changes
      .filter((change) => change.beforeDueDate !== change.afterDueDate)
      .map((change) => keyOf(change.entityType, change.entityId));

  apply(input.preview.changes);
  let frontier = new Set(finishMoved(input.preview.changes));
  let pushedAny = false;
  let rounds = 0;
  while (frontier.size > 0) {
    // Every round follows one link further; more rounds than links means the
    // project links form a loop that would push forever.
    if (++rounds > input.links.length + 1) {
      throw new ScheduleError("cycle", "Project dependency cycle");
    }
    const next = new Set<string>();
    for (const link of input.links) {
      if (!frontier.has(keyOf(link.predecessorType, link.predecessorId))) continue;
      const predecessor =
        link.predecessorType === "project"
          ? projects.get(link.predecessorId)
          : tasks.get(link.predecessorId);
      const successor =
        link.successorType === "project"
          ? projects.get(link.successorId)
          : tasks.get(link.successorId);
      if (!predecessor?.dueDate || !successor?.startDate || !successor.dueDate) {
        continue;
      }
      const requiredStart = addCalendarDays(predecessor.dueDate, 1);
      if (successor.startDate >= requiredStart) continue;
      const shift = calendarDayDistance(successor.startDate, requiredStart);
      const pushed = previewScheduleEdit({
        tasks: [...tasks.values()],
        projects: [...projects.values()],
        dependencies: input.dependencies,
        edit: {
          entityType: link.successorType,
          entityId: link.successorId,
          operation: "move",
          startDate: requiredStart,
          dueDate: addCalendarDays(successor.dueDate, shift),
        },
      });
      apply(pushed.changes.map((change) => ({ ...change, cause: "dependency" as const })));
      finishMoved(pushed.changes).forEach((key) => next.add(key));
      pushedAny = true;
    }
    frontier = next;
  }
  if (!pushedAny) return input.preview;

  const changed = <T extends { id: string; startDate: string | null; dueDate: string | null }>(
    entityType: ScheduleEntityType,
    originals: T[],
    current: Map<string, T>,
  ): ScheduleEntityChange[] =>
    originals.flatMap((before) => {
      const after = current.get(before.id)!;
      if (before.startDate === after.startDate && before.dueDate === after.dueDate) {
        return [];
      }
      return [{
        entityType,
        entityId: before.id,
        beforeStartDate: before.startDate,
        beforeDueDate: before.dueDate,
        afterStartDate: after.startDate,
        afterDueDate: after.dueDate,
        cause: causes.get(keyOf(entityType, before.id)) ?? "dependency",
      }];
    });
  const taskChanges = changed("task", input.tasks, tasks);
  const projectChanges = changed("project", input.projects, projects);
  return {
    ...input.preview,
    changes: [...taskChanges, ...projectChanges],
    impact: {
      ...input.preview.impact,
      affectedTaskCount: taskChanges.length,
      affectedProjectCount: projectChanges.length,
      conflictTaskIds: [
        ...dependencyConflicts([...tasks.values()], input.dependencies),
      ],
    },
  };
}
