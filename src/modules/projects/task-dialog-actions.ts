"use server";

import { z } from "zod";
import { and, asc, eq, isNotNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  projectTaskDependencies,
  projects,
  taskDependencies,
  tasks,
} from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { taskAncestors, taskDescendants } from "@/modules/projects/schedule";
import { upsertTask, type TaskInput } from "./task-actions";
import { upsertTaskDependency } from "./dependency-actions";
import {
  TaskMoveError,
  deleteTaskLiftingChildren,
  moveTaskSubtreeToProject,
  type TaskMoveErrorCode,
} from "./task-move";

// Next.js hides thrown server-action messages in production builds, so the
// board's task dialog gets result objects with codes it can translate.

export type TaskDialogSaveCode =
  | "dates_together"
  | "due_before_start"
  | "constraint_date_required"
  | "subtasks_open";
export type TaskDialogResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; code: TaskDialogSaveCode | TaskMoveErrorCode | "dependency_cycle" | "dependency_hierarchy" };

function errorMessages(error: unknown): string[] {
  if (error instanceof z.ZodError) return error.issues.map((issue) => issue.message);
  return error instanceof Error ? [error.message] : [];
}

function saveCode(error: unknown): TaskDialogSaveCode | null {
  const messages = errorMessages(error);
  if (messages.includes("Start and due date must be scheduled together")) return "dates_together";
  if (messages.includes("Due date precedes start date")) return "due_before_start";
  if (messages.includes("A fixed start needs a date")) return "constraint_date_required";
  if (messages.includes("Complete all subtasks before completing the parent")) return "subtasks_open";
  return null;
}

/** `upsertTask` for the board dialog, with translatable validation codes. */
export async function saveTaskFromDialog(
  input: TaskInput,
): Promise<TaskDialogResult<{ id: string }>> {
  try {
    const saved = await upsertTask(input);
    return { ok: true, id: saved.id };
  } catch (error) {
    const code = saveCode(error);
    if (code) return { ok: false, code };
    throw error;
  }
}

const dependencyInputSchema = z.object({
  predecessorTaskId: z.string().min(1),
  successorTaskId: z.string().min(1),
  dependencyType: z
    .enum(["finish_to_start", "start_to_start", "finish_to_finish", "start_to_finish"])
    .default("finish_to_start"),
  lagDays: z.number().int().min(-365).max(365).default(0),
});

/**
 * Adds a link through the timeline's own `upsertTaskDependency`, so both views
 * share one dependency table and one set of rules, and reports a cycle or a
 * link into the task's own branch as a code.
 */
export async function addTaskDependencyFromDialog(
  input: z.input<typeof dependencyInputSchema>,
): Promise<TaskDialogResult> {
  const data = dependencyInputSchema.parse(input);
  const result = await upsertTaskDependency({
    ...data,
    routeOffsetDays: null,
    routeOffsetRows: null,
  });
  if (result.ok) return { ok: true };
  if (result.code === "cycle") return { ok: false, code: "dependency_cycle" };
  if (result.code === "hierarchy") return { ok: false, code: "dependency_hierarchy" };
  throw new Error(`Dependency could not be saved: ${result.code}`);
}

/**
 * Removes a legacy "start after project" link. These rows live in
 * `project_task_dependencies`, which the timeline cannot show, so the dialog
 * is the one place where they are visible.
 */
export async function deleteProjectTaskDependency(id: string) {
  await requireUserOrThrow();
  const dependencyId = z.string().min(1).parse(id);
  const row = db
    .select({ successorTaskId: projectTaskDependencies.successorTaskId })
    .from(projectTaskDependencies)
    .where(eq(projectTaskDependencies.id, dependencyId))
    .get();
  if (!row) return;
  db.delete(projectTaskDependencies).where(eq(projectTaskDependencies.id, dependencyId)).run();
  const task = db.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, row.successorTaskId)).get();
  if (task?.projectId) revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/projects");
}

/**
 * Everything the board dialog shows about an existing task that the board's
 * own props do not carry: links in both directions (across projects), legacy
 * project links, candidates for new links, move targets, and the subtree size.
 */
export async function getTaskDialogDetails(taskId: string) {
  await requireUserOrThrow();
  const id = z.string().min(1).parse(taskId);
  const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!task || !task.projectId) throw new Error("Task not found");

  const projectRows = db
    .select({ id: projects.id, name: projects.name, status: projects.status })
    .from(projects)
    .orderBy(asc(projects.name))
    .all();
  const projectNames = new Map(projectRows.map((project) => [project.id, project.name]));
  const taskRows = db
    .select({
      id: tasks.id,
      title: tasks.title,
      projectId: tasks.projectId,
      parentTaskId: tasks.parentTaskId,
    })
    .from(tasks)
    .where(and(isNotNull(tasks.projectId), eq(tasks.kind, "task")))
    .orderBy(asc(tasks.projectId), asc(tasks.sortOrder))
    .all();
  const byId = new Map(taskRows.map((row) => [row.id, row]));
  const describe = (otherId: string) => {
    const other = byId.get(otherId);
    return {
      title: other?.title ?? "",
      projectName: other?.projectId && other.projectId !== task.projectId
        ? projectNames.get(other.projectId) ?? null
        : null,
    };
  };

  const links = db
    .select()
    .from(taskDependencies)
    .where(or(eq(taskDependencies.successorTaskId, id), eq(taskDependencies.predecessorTaskId, id)))
    .orderBy(asc(taskDependencies.createdAt))
    .all();
  const toLink = (row: (typeof links)[number], otherId: string) => ({
    id: row.id,
    taskId: otherId,
    dependencyType: row.dependencyType,
    lagDays: row.lagDays,
    ...describe(otherId),
  });

  const activeProjectIds = new Set(
    projectRows.filter((project) => project.status === "active").map((project) => project.id),
  );
  const excluded = new Set([
    id,
    ...taskAncestors(taskRows, id).map((row) => row.id),
    ...taskDescendants(taskRows, id).map((row) => row.id),
  ]);

  return {
    predecessors: links
      .filter((row) => row.successorTaskId === id)
      .map((row) => toLink(row, row.predecessorTaskId)),
    successors: links
      .filter((row) => row.predecessorTaskId === id)
      .map((row) => toLink(row, row.successorTaskId)),
    projectPredecessors: db
      .select({
        id: projectTaskDependencies.id,
        projectId: projectTaskDependencies.predecessorProjectId,
      })
      .from(projectTaskDependencies)
      .where(eq(projectTaskDependencies.successorTaskId, id))
      .all()
      .map((row) => ({ ...row, projectName: projectNames.get(row.projectId) ?? "" })),
    linkableTasks: taskRows
      .filter((row) => !excluded.has(row.id) && row.projectId && activeProjectIds.has(row.projectId))
      .map((row) => ({ id: row.id, ...describe(row.id) })),
    projects: projectRows
      .filter((project) => project.status === "active" || project.id === task.projectId)
      .map((project) => ({ id: project.id, name: project.name })),
    descendantCount: taskDescendants(taskRows, id).length,
  };
}

export type TaskDialogDetails = Awaited<ReturnType<typeof getTaskDialogDetails>>;

const moveToProjectSchema = z.object({
  taskId: z.string().min(1),
  projectId: z.string().min(1),
});

/**
 * Moves a task with its whole subtree into another project, as one
 * transaction. Dependencies are kept; see `moveTaskSubtreeToProject`.
 */
export async function moveTaskToProject(
  input: z.input<typeof moveToProjectSchema>,
): Promise<TaskDialogResult<{ projectId: string }>> {
  await requireUserOrThrow();
  const data = moveToProjectSchema.parse(input);
  let sourceProjectId: string;
  try {
    sourceProjectId = db.transaction(() =>
      moveTaskSubtreeToProject(data.taskId, data.projectId).sourceProjectId,
    );
  } catch (error) {
    if (error instanceof TaskMoveError) return { ok: false, code: error.code };
    throw error;
  }
  revalidatePath(`/projects/${sourceProjectId}`);
  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  revalidatePath("/calendar");
  return { ok: true, projectId: data.projectId };
}

/**
 * Deletes a task but first lifts its direct children into its place, in one
 * transaction, so a failure never leaves half-moved subtasks behind.
 */
export async function deleteTaskKeepingSubtasks(taskId: string) {
  await requireUserOrThrow();
  const id = z.string().min(1).parse(taskId);
  const exists = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)).get();
  if (!exists) return;
  const { projectId } = db.transaction(() => deleteTaskLiftingChildren(id));
  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}
