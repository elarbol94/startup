import "server-only";

// Transactional core for creating a plain task from another module (e.g. an
// accepted meeting action item). No authentication and no revalidation: the
// calling action does both, and runs this inside its own transaction so the
// task and the caller's records commit together.
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contextLinks, projects, taskContexts, tasks } from "@/db/schema";
import { safeInternalRoute } from "@/lib/internal-route";
import { saveTaskAssignees } from "./assignees";
import { firstProjectColumn, nextContextTaskSortOrder } from "./project-action-helpers";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NewTaskInput = {
  title: string;
  description: string;
  projectId: string | null;
  assigneeIds: string[];
  dueDate: string | null;
  /** Where the task came from; shown as the task's origin link. */
  origin: { route: string; label: string; entityId: string };
};

export function createTaskInTransaction(tx: Transaction, input: NewTaskInput, actorId: string) {
  if (input.projectId && !tx.select({ id: projects.id }).from(projects).where(eq(projects.id, input.projectId)).get()) {
    throw new Error("Project not found");
  }
  const column = input.projectId ? firstProjectColumn(input.projectId, false) : undefined;
  if (input.projectId && !column) throw new Error("Project has no task column");
  const columnId = column?.id ?? null;
  const now = new Date();
  const task = tx.insert(tasks).values({
    kind: "task",
    projectId: input.projectId,
    columnId,
    lastOpenColumnId: columnId,
    parentTaskId: null,
    title: input.title,
    description: input.description,
    dueDate: input.dueDate,
    // A due date without a start would fail the task form's start ≤ due rule later.
    startDate: input.dueDate,
    priority: "medium",
    status: "open",
    workflowStage: "todo",
    sortOrder: nextContextTaskSortOrder(columnId),
    createdBy: actorId,
    updatedAt: now,
  }).returning({ id: tasks.id }).get();
  saveTaskAssignees(tx, { taskId: task.id, assigneeIds: input.assigneeIds, actorId });
  const route = safeInternalRoute(input.origin.route);
  tx.insert(taskContexts).values({
    taskId: task.id, type: "app", entityId: input.origin.entityId, route, label: input.origin.label, anchorJson: "{}", updatedAt: now,
  }).run();
  tx.insert(contextLinks).values({
    ownerType: "task", ownerId: task.id, targetType: "app", targetId: input.origin.entityId, relation: "origin",
    route, label: input.origin.label, anchorJson: "{}", createdBy: actorId, updatedAt: now,
  }).run();
  return { id: task.id, projectId: input.projectId };
}
