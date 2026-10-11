// Groups dashboard tasks by due date (design 1b): overdue, this & next week, later, done.
import type { TaskPriority } from "./types";

export const taskBuckets = ["overdue", "soon", "later", "done"] as const;
export type TaskBucket = typeof taskBuckets[number];

type BucketTask = { dueDate: string | null; priority: TaskPriority };

const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

/** Sunday of the week after the one containing `today` (ISO weeks start on Monday). */
export function endOfNextWeek(today: string): string {
  const [year, month, day] = today.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const mondayBased = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() + (6 - mondayBased) + 7);
  return date.toISOString().slice(0, 10);
}

/** Bucket of an open task by its due date; tasks without a date count as "later". */
export function openTaskBucket(dueDate: string | null, today: string): Exclude<TaskBucket, "done"> {
  if (!dueDate) return "later";
  if (dueDate < today) return "overdue";
  return dueDate <= endOfNextWeek(today) ? "soon" : "later";
}

/** Due date first (undated last), then priority. */
export function compareBucketTasks(a: BucketTask, b: BucketTask): number {
  if (a.dueDate !== b.dueDate) {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate < b.dueDate ? -1 : 1;
  }
  return priorityRank[a.priority] - priorityRank[b.priority];
}

/**
 * Non-empty buckets in display order. `done` decides which tasks land in "Erledigt";
 * a task completed a moment ago can report false here to stay in place, struck through.
 */
export function groupTasksByBucket<T extends BucketTask>(tasks: T[], today: string, done: (task: T) => boolean): { bucket: TaskBucket; tasks: T[] }[] {
  const groups = new Map<TaskBucket, T[]>(taskBuckets.map((bucket) => [bucket, []]));
  for (const task of tasks) groups.get(done(task) ? "done" : openTaskBucket(task.dueDate, today))!.push(task);
  return taskBuckets
    .map((bucket) => ({ bucket, tasks: groups.get(bucket)!.sort(compareBucketTasks) }))
    .filter((group) => group.tasks.length > 0);
}
