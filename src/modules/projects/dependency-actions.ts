"use server";

// Task dependency link actions: create/update, delete and resetting routed link paths.
// Used by task-dialog.tsx, task-dialog-actions.ts and portfolio-client.tsx.
import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { taskDependencies, tasks } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { assertDependencyEndpoints, hasScheduleCycle } from "@/modules/projects/schedule";
import { ScheduleError, scheduleFailure, type ScheduleFailure } from "./schedule-errors";
import { idSchema } from "./project-action-helpers";

const dependencySchema = z.object({
  id: z.string().optional(),
  predecessorTaskId: z.string().min(1),
  successorTaskId: z.string().min(1),
  dependencyType: z
    .enum([
      "finish_to_start",
      "start_to_start",
      "finish_to_finish",
      "start_to_finish",
    ])
    .default("finish_to_start"),
  lagDays: z.number().int().min(-365).max(365).default(0),
  routeOffsetDays: z.number().int().min(-3650).max(3650).nullable().default(null),
  routeOffsetRows: z.number().int().min(-400).max(400).nullable().default(null),
});

type TaskDependencyRow = typeof taskDependencies.$inferSelect;

export async function upsertTaskDependency(
  input: z.input<typeof dependencySchema>,
): Promise<{ ok: true; dependency: TaskDependencyRow } | ScheduleFailure> {
  await requireUserOrThrow();
  const data = dependencySchema.parse(input);
  let persisted: TaskDependencyRow;
  try {
    persisted = db.transaction(() => saveTaskDependency(data));
  } catch (error) {
    return scheduleFailure(error);
  }
  revalidatePath("/projects");
  return { ok: true, dependency: persisted };
}

function saveTaskDependency(data: z.infer<typeof dependencySchema>): TaskDependencyRow {
  // Summary tasks may sit at either end of a link (R6). A link between a task
  // and its own ancestor or descendant is still impossible, because a summary
  // already spans its subtree.
  const hierarchyTasks = db
    .select({ id: tasks.id, parentTaskId: tasks.parentTaskId })
    .from(tasks)
    .all();
  if (
    !hierarchyTasks.some((task) => task.id === data.predecessorTaskId) ||
    !hierarchyTasks.some((task) => task.id === data.successorTaskId)
  ) {
    throw new ScheduleError("not-found", "Task not found");
  }
  assertDependencyEndpoints(hierarchyTasks, data);
  const existing = db.select().from(taskDependencies).all();
  if (data.id && !existing.some((dependency) => dependency.id === data.id)) {
    throw new ScheduleError("not-found", "Dependency not found");
  }
  const candidate = [
    ...existing.filter((dependency) => dependency.id !== data.id),
    {
      predecessorTaskId: data.predecessorTaskId,
      successorTaskId: data.successorTaskId,
      dependencyType: data.dependencyType,
      lagDays: data.lagDays,
      routeOffsetDays: data.routeOffsetDays,
      routeOffsetRows: data.routeOffsetRows,
    },
  ];
  if (hasScheduleCycle(hierarchyTasks, candidate)) {
    throw new ScheduleError("cycle", "Dependency cycle");
  }
  if (data.id) {
    db.update(taskDependencies)
      .set({
        predecessorTaskId: data.predecessorTaskId,
        successorTaskId: data.successorTaskId,
        dependencyType: data.dependencyType,
        lagDays: data.lagDays,
        routeOffsetDays: data.routeOffsetDays,
        routeOffsetRows: data.routeOffsetRows,
      })
      .where(eq(taskDependencies.id, data.id))
      .run();
  } else {
    const duplicate = existing.find(
      (dependency) =>
        dependency.predecessorTaskId === data.predecessorTaskId &&
        dependency.successorTaskId === data.successorTaskId,
    );
    if (duplicate) {
      db.update(taskDependencies)
        .set({
          dependencyType: data.dependencyType,
          lagDays: data.lagDays,
          routeOffsetDays: data.routeOffsetDays,
          routeOffsetRows: data.routeOffsetRows,
        })
        .where(eq(taskDependencies.id, duplicate.id))
        .run();
    } else {
      db.insert(taskDependencies).values(data).run();
    }
  }
  const persisted = data.id
    ? db
        .select()
        .from(taskDependencies)
        .where(eq(taskDependencies.id, data.id))
        .get()
    : db
        .select()
        .from(taskDependencies)
        .where(
          and(
            eq(
              taskDependencies.predecessorTaskId,
              data.predecessorTaskId,
            ),
            eq(taskDependencies.successorTaskId, data.successorTaskId),
          ),
        )
        .get();
  if (!persisted) throw new Error("Dependency not found after save");
  return persisted;
}

/**
 * Returns the deleted row so the caller can offer undo by saving it again.
 * Deleting a link that is already gone reports `not-found`.
 */
export async function deleteTaskDependency(
  id: string,
): Promise<{ ok: true; dependency: TaskDependencyRow } | ScheduleFailure> {
  await requireUserOrThrow();
  const dependencyId = idSchema.parse(id);
  const projectIds = db
    .select({ projectId: tasks.projectId })
    .from(taskDependencies)
    .innerJoin(
      tasks,
      sql`${tasks.id} in (${taskDependencies.predecessorTaskId}, ${taskDependencies.successorTaskId})`,
    )
    .where(eq(taskDependencies.id, dependencyId))
    .all()
    .map((row) => row.projectId);
  const deleted = db
    .delete(taskDependencies)
    .where(eq(taskDependencies.id, dependencyId))
    .returning()
    .get();
  if (!deleted) return { ok: false, code: "not-found" };
  new Set(projectIds).forEach((projectId) => {
    if (projectId) revalidatePath(`/projects/${projectId}`);
  });
  revalidatePath("/projects");
  return { ok: true, dependency: deleted };
}

export async function resetDependencyRoutes(input: { ids: string[] }) {
  await requireUserOrThrow();
  const { ids } = z.object({ ids: z.array(z.string().min(1)).max(2000) }).parse(input);
  if (!ids.length) return;
  db.transaction(() => {
    db.update(taskDependencies).set({ routeOffsetDays: null, routeOffsetRows: null }).where(inArray(taskDependencies.id, ids)).run();
  });
  revalidatePath("/projects");
}
