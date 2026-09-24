// Board-level completion and project deadline-risk forecasting on top of the task
// tree and date maths. Re-exported from ../schedule.ts.
import type { ScheduleTask } from "./schedule-types";
import { addCalendarDays, calendarDaysInclusive } from "./date-math";
import { leafTasks } from "./task-tree";

/**
 * A task counts as done when it sits in a completed column. This is the rule
 * the board uses; `progress` is only an estimate and can lag behind.
 */
export function isTaskDone(task: { columnIsCompleted?: boolean | null }): boolean {
  return Boolean(task.columnIsCompleted);
}

/**
 * Whether a project is at risk of missing its target.
 *
 * Unfinished work that is already overdue cannot finish before today, so its
 * remaining share of the planned duration is projected from today. The project
 * is at risk when that forecast (or any planned finish) lands after the target,
 * or when a milestone was missed. A single task running a few days late inside
 * a project with slack is not a risk to the project. Without a target date,
 * any overdue unfinished work counts, because there is nothing to absorb it.
 */
export function projectScheduleRisk(
  project: { targetEndDate: string | null },
  tasks: (ScheduleTask & { columnIsCompleted?: boolean | null })[],
  today: string,
): boolean {
  const leaves = leafTasks(tasks);
  let overdue = false;
  let forecastEnd: string | null = null;
  for (const task of leaves) {
    if (!task.dueDate) continue;
    let finish = task.dueDate;
    if (!isTaskDone(task) && task.dueDate < today) {
      if (task.isMilestone) return true;
      overdue = true;
      const duration = task.startDate
        ? Math.max(1, calendarDaysInclusive(task.startDate, task.dueDate))
        : 1;
      const progress = Math.min(100, Math.max(0, task.progress ?? 0));
      const remaining = Math.max(1, Math.ceil((duration * (100 - progress)) / 100));
      finish = addCalendarDays(today, remaining - 1);
    }
    if (!forecastEnd || finish > forecastEnd) forecastEnd = finish;
  }
  if (!project.targetEndDate) return overdue;
  return Boolean(forecastEnd && forecastEnd > project.targetEndDate);
}
