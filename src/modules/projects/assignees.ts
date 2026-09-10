import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { taskAssignees, tasks, user, wikiNotifications } from "@/db/schema";

export type TaskAssignee = { id: string; name: string };
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Correlated aggregates keep one row per task, including unassigned tasks.
export const taskAssigneeFields = {
  assigneeIds: sql<string>`(select json_group_array(user_id) from
    (select user_id from task_assignees where task_id = ${tasks.id} order by user_id))`
    .mapWith((value: string): string[] => JSON.parse(value)),
  assignees: sql<string>`(select json_group_array(json_object('id', id, 'name', name)) from
    (select u.id, u.name from task_assignees a join user u on u.id = a.user_id
    where a.task_id = ${tasks.id} order by u.name, u.id))`
    .mapWith((value: string): TaskAssignee[] => JSON.parse(value)),
  assigneeName: sql<string | null>`(select group_concat(name, ', ') from
    (select u.name from task_assignees a join user u on u.id = a.user_id
    where a.task_id = ${tasks.id} order by u.name, u.id))`,
};

export function assignedTo(userId: string) {
  return sql`exists (select 1 from ${taskAssignees}
    where ${taskAssignees.taskId} = ${tasks.id} and ${taskAssignees.userId} = ${userId})`;
}

export const unassignedTask = sql`not exists (select 1 from ${taskAssignees}
  where ${taskAssignees.taskId} = ${tasks.id})`;

/** Run inside the task mutation: assignments and notifications commit together. */
export function saveTaskAssignees(tx: Transaction, input: {
  taskId: string;
  assigneeIds?: string[];
  actorId: string;
  pageId?: string | null;
}) {
  // An omitted assignment field must never clear existing assignments.
  if (input.assigneeIds === undefined) return;
  const previous = tx.select({ id: taskAssignees.userId }).from(taskAssignees)
    .where(eq(taskAssignees.taskId, input.taskId)).orderBy(asc(taskAssignees.userId)).all();
  const previousIds = new Set(previous.map((row) => row.id));
  const nextIds = [...new Set(input.assigneeIds)];
  const added = nextIds.filter((id) => !previousIds.has(id));
  if (added.length) {
    const active = tx.select({ id: user.id }).from(user)
      .where(and(inArray(user.id, added), isNull(user.removedAt))).all();
    if (active.length !== added.length) throw new Error("Assignee not found");
  }
  tx.delete(taskAssignees).where(eq(taskAssignees.taskId, input.taskId)).run();
  if (nextIds.length) tx.insert(taskAssignees).values(nextIds.map((userId) => ({
    taskId: input.taskId, userId,
  }))).run();
  for (const userId of added) {
    if (userId === input.actorId) continue;
    tx.insert(wikiNotifications).values({
      userId, actorId: input.actorId, type: "assignment",
      pageId: input.pageId ?? null, taskId: input.taskId,
    }).run();
  }
}
