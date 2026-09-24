"use server";

// Project task actions: create/update, open/done status, delete and reparenting in
// the task tree. Used by task-dialog.tsx, portfolio-client.tsx, task-dialog-actions.ts
// and the tasks module.
import { z } from "zod";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  contextLinks,
  projectColumns,
  projectTaskDependencies,
  projects,
  scheduleConstraintTypes,
  taskDependencies,
  tasks,
} from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import {
  assertDependencyEndpoints,
  assertTaskHierarchy,
  hasScheduleCycle,
  inferScheduleEditOperation,
  leafTasks,
  taskDescendants,
} from "@/modules/projects/schedule";
import { saveTaskAssignees } from "./assignees";
import { assertProjectEditable } from "./guards";
import { deleteTaskSubtreeSideRows } from "./cleanup";
import {
  SORT_GAP,
  nextSortOrder,
  projectHierarchyRows,
  syncParentSummary,
  syncProjectBounds,
  syncTaskAncestors,
} from "./task-sync";
import { cascadeProjectSuccessors } from "./project-links";
import { ScheduleError, scheduleFailure, type ScheduleFailure } from "./schedule-errors";
import {
  revalidateTaskViews,
  firstProjectColumn,
  nextContextTaskSortOrder,
  completionTime,
} from "./project-action-helpers";
import { computeSchedulePreview } from "./schedule-action-helpers";

const taskSchema = z.object({
  id: z.string().optional(),
  projectId: z.string().min(1),
  columnId: z.string().min(1),
  parentTaskId: z.string().nullable().optional().default(null),
  title: z.string().min(1).max(300),
  description: z.string().max(5000).default(""),
  assigneeIds: z.array(z.string().min(1)).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .default(null),
  progress: z.number().int().min(0).max(100).optional().default(0),
  isMilestone: z.boolean().optional().default(false),
  // Omitted means "keep the stored constraint". Only an explicit value changes
  // it, so editors that do not show the constraint cannot reset it by saving.
  constraintType: z.enum(scheduleConstraintTypes).optional(),
  constraintDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  predecessor: z.object({ type: z.enum(["project", "task"]), id: z.string().min(1) }).nullable().optional().default(null),
}).superRefine((data, context) => {
  if (
    (data.startDate && !data.dueDate && !data.isMilestone) ||
    (!data.startDate && data.dueDate)
  ) {
    context.addIssue({
      code: "custom",
      path: ["dueDate"],
      message: "Start and due date must be scheduled together",
    });
  }
  if (data.constraintType === "must_start_on" && data.constraintDate === null) {
    context.addIssue({
      code: "custom",
      path: ["constraintDate"],
      message: "A fixed start needs a date",
    });
  }
});

// The pre-parse shape, so callers may omit anything the schema defaults.
export type TaskInput = z.input<typeof taskSchema>;

export async function upsertTask(input: TaskInput): Promise<{ id: string }> {
  const user = await requireUserOrThrow();
  const data = taskSchema.parse(input);
  const existing = data.id
    ? db.select().from(tasks).where(eq(tasks.id, data.id)).get()
    : undefined;
  if (data.id && !existing) throw new Error("Task not found");
  if (existing && existing.kind !== "task") throw new Error("Task kind cannot be changed");
  // The update never rewrites projectId, so a foreign projectId would pass the column check below and orphan the task.
  if (existing && existing.projectId !== data.projectId) throw new Error("Task belongs to another project");
  assertProjectEditable(data.projectId);
  const parent = data.parentTaskId
    ? db.select().from(tasks).where(eq(tasks.id, data.parentTaskId)).get()
    : undefined;
  if (data.parentTaskId && !parent) throw new Error("Parent task not found");
  // Phase assignments are retained only as inert legacy data. New roots have no
  // phase; children inherit an existing legacy value solely for compatibility.
  const legacyPhaseId = existing?.phaseId ?? parent?.phaseId ?? null;
  const hierarchyTasks = db
    .select({
      id: tasks.id,
      projectId: sql<string>`${tasks.projectId}`,
      parentTaskId: tasks.parentTaskId,
      isMilestone: tasks.isMilestone,
    })
    .from(tasks)
    .where(isNotNull(tasks.projectId))
    .all();
  assertTaskHierarchy(hierarchyTasks, {
    id: data.id ?? "__new__",
    projectId: data.projectId,
    parentTaskId: data.parentTaskId,
    isMilestone: data.isMilestone,
  });
  const existingChildren = existing
    ? db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.parentTaskId, existing.id))
        .all()
    : [];
  const parentChildren = parent
    ? db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.parentTaskId, parent.id))
        .all()
    : [];
  if (existingChildren.length > 0 && data.isMilestone) {
    throw new Error("A task with subtasks cannot become a milestone");
  }
  const promotesParent = Boolean(parent) && parentChildren.length === 0 &&
    existing?.parentTaskId !== parent?.id;
  const normalizedDueDate = data.isMilestone ? data.startDate : data.dueDate;
  if (data.startDate && normalizedDueDate && normalizedDueDate < data.startDate) {
    throw new Error("Due date precedes start date");
  }

  const targetColumn = db
    .select({
      projectId: projectColumns.projectId,
      isCompleted: projectColumns.isCompleted,
    })
    .from(projectColumns)
    .where(eq(projectColumns.id, data.columnId))
    .get();
  if (!targetColumn) throw new Error("Column not found");
  if (targetColumn.projectId !== data.projectId) {
    throw new Error("Column belongs to another project");
  }
  if (
    existingChildren.length > 0 &&
    targetColumn.isCompleted &&
    leafTasks(
      taskDescendants(projectHierarchyRows(data.projectId), existing!.id),
    ).some((child) => !child.columnIsCompleted)
  ) {
    throw new Error("Complete all subtasks before completing the parent");
  }
  // An omitted constraint keeps the stored one. An explicit type without a date
  // clears the date, because a stored date belonged to the previous type.
  const constraintType = data.constraintType ?? existing?.constraintType ?? "asap";
  const constraintDate = constraintType === "asap"
    ? null
    : data.constraintDate !== undefined
      ? data.constraintDate
      : data.constraintType === undefined
        ? existing?.constraintDate ?? null
        : null;
  if (existingChildren.length === 0 && constraintType === "must_start_on" && !constraintDate) {
    throw new Error("A fixed start needs a date");
  }
  const values = {
    title: data.title,
    description: data.description,
    assigneeId: null,
    phaseId: legacyPhaseId,
    parentTaskId: data.parentTaskId,
    progress: targetColumn.isCompleted ? 100 : data.progress,
    isMilestone: data.isMilestone,
    // Only leaves carry constraints; a summary's dates come from its children.
    constraintType: existingChildren.length > 0 ? "asap" as const : constraintType,
    constraintDate: existingChildren.length > 0 ? null : constraintDate,
    priority: data.priority,
    status: targetColumn.isCompleted ? "done" as const : "open" as const,
    completedAt: targetColumn.isCompleted
      ? existing?.status === "done" && existing.completedAt ? existing.completedAt : new Date()
      : null,
    lastOpenColumnId: targetColumn.isCompleted
      ? existing?.status === "open"
        ? existing.columnId
        : existing?.lastOpenColumnId ?? null
      : data.columnId,
    updatedAt: new Date(),
  };
  const scheduleDatesChanged = Boolean(
    existing &&
      (existing.startDate !== data.startDate ||
        existing.dueDate !== normalizedDueDate),
  );
  const schedulesExistingTask = Boolean(
    existing && data.startDate && normalizedDueDate && scheduleDatesChanged,
  );
  const scheduleOperation =
    existing &&
    data.startDate &&
    normalizedDueDate
      ? inferScheduleEditOperation(existing, {
          startDate: data.startDate,
          dueDate: normalizedDueDate,
        })
      : "place" as const;

  let id = data.id;
  db.transaction((tx) => {
    if (promotesParent && parent) {
      tx.update(tasks)
        .set({ constraintType: "asap", constraintDate: null, updatedAt: new Date() })
        .where(eq(tasks.id, parent.id))
        .run();
    }
    if (id && existing) {
      const movedScope =
        existing.columnId !== data.columnId ||
        existing.parentTaskId !== data.parentTaskId;
      // Persist non-date fields first. The shared planner then reads the new
      // hierarchy/constraint state while the old dates are still available as
      // its concurrency baseline.
      tx.update(tasks)
        .set({
          ...values,
          columnId: data.columnId,
          sortOrder: movedScope
            ? nextSortOrder(data.columnId, data.parentTaskId)
            : existing.sortOrder,
        })
        .where(eq(tasks.id, id))
        .run();
      if (schedulesExistingTask && data.startDate && normalizedDueDate) {
        const preview = computeSchedulePreview(
          {
            entityType: "task",
            entityId: id,
            operation: scheduleOperation,
            startDate: data.startDate,
            dueDate: normalizedDueDate,
          },
          tx,
        );
        for (const change of preview.changes) {
          if (change.entityType === "task") {
            tx.update(tasks)
              .set({
                startDate: change.afterStartDate,
                dueDate: change.afterDueDate,
                updatedAt: new Date(),
              })
              .where(eq(tasks.id, change.entityId))
              .run();
          } else {
            tx.update(projects)
              .set({
                plannedStartDate: change.afterStartDate,
                targetEndDate: change.afterDueDate,
                updatedAt: new Date(),
              })
              .where(eq(projects.id, change.entityId))
              .run();
          }
        }
      } else if (scheduleDatesChanged) {
        // Clearing a leaf schedule has no dependency floor to cascade. Parent
        // and project containers intentionally retain their current slack.
        tx.update(tasks)
          .set({
            startDate: data.startDate,
            dueDate: normalizedDueDate,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, id))
          .run();
      }
    } else {
      const row = tx
        .insert(tasks)
        .values({
          ...values,
          startDate: data.startDate,
          dueDate: normalizedDueDate,
          projectId: data.projectId,
          columnId: data.columnId,
          sortOrder: nextSortOrder(data.columnId, data.parentTaskId),
          createdBy: user.id,
        })
        .returning({ id: tasks.id })
        .get();
      id = row.id;
      if (data.predecessor?.type === "task") {
        const predecessor = tx.select().from(tasks).where(eq(tasks.id, data.predecessor.id)).get();
        if (!predecessor) throw new Error("Predecessor task not found");
        const dependency = { predecessorTaskId: predecessor.id, successorTaskId: row.id, lagDays: 0 };
        assertDependencyEndpoints([...hierarchyTasks, { id: row.id, parentTaskId: data.parentTaskId }], dependency);
        const allDependencies = tx.select().from(taskDependencies).all();
        if (hasScheduleCycle([...hierarchyTasks, { id: row.id, parentTaskId: data.parentTaskId }], [...allDependencies, dependency])) throw new Error("Dependency cycle");
        tx.insert(taskDependencies).values(dependency).run();
      } else if (data.predecessor?.type === "project") {
        const predecessor = tx.select().from(projects).where(eq(projects.id, data.predecessor.id)).get();
        if (!predecessor) throw new Error("Predecessor project not found");
        tx.insert(projectTaskDependencies).values({ predecessorProjectId: predecessor.id, successorTaskId: row.id }).run();
      }
    }
    if (!id) throw new Error("Task was not saved");
    saveTaskAssignees(tx, { taskId: id, assigneeIds: data.assigneeIds, actorId: user.id });
    const affectedParents = new Set(
      [existing?.parentTaskId, data.parentTaskId].filter(
        (parentTaskId): parentTaskId is string => Boolean(parentTaskId),
      ),
    );
    affectedParents.forEach(syncTaskAncestors);
    if (id && existingChildren.length > 0) syncParentSummary(id);
    syncProjectBounds(data.projectId);
  });

  if (id && (scheduleDatesChanged || !existing)) cascadeProjectSuccessors("task", id);

  revalidatePath(`/projects/${data.projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  revalidatePath("/calendar");
  revalidatePath("/wiki", "layout");
  if (!id) throw new Error("Task was not saved");
  return { id };
}

const taskStatusSchema = z.object({ id: z.string().min(1), status: z.enum(["open", "done"]) });

export async function setTaskStatus(id: string, status: "open" | "done") {
  await requireUserOrThrow();
  const data = taskStatusSchema.parse({ id, status });
  const task = db.select().from(tasks).where(eq(tasks.id, data.id)).get();
  if (!task) throw new Error("Task not found");
  const projectId = task.projectId;
  const now = new Date();
  let columnId = task.columnId;
  let lastOpenColumnId = task.lastOpenColumnId;

  if (projectId) {
    const currentColumn = task.columnId
      ? db.select().from(projectColumns).where(eq(projectColumns.id, task.columnId)).get()
      : undefined;
    if (data.status === "done") {
      const descendants = taskDescendants(projectHierarchyRows(projectId), task.id);
      if (leafTasks(descendants).some((child) => !child.columnIsCompleted)) {
        throw new Error("Complete all subtasks before completing the parent");
      }
      const completed = currentColumn?.isCompleted
        ? currentColumn
        : firstProjectColumn(projectId, true);
      if (!completed) throw new Error("Project has no completed column");
      if (task.status === "open" && !currentColumn?.isCompleted) lastOpenColumnId = task.columnId;
      columnId = completed.id;
    } else if (currentColumn && !currentColumn.isCompleted) {
      lastOpenColumnId = currentColumn.id;
    } else {
      const remembered = task.lastOpenColumnId
        ? db.select().from(projectColumns).where(
            and(
              eq(projectColumns.id, task.lastOpenColumnId),
              eq(projectColumns.projectId, projectId),
              eq(projectColumns.isCompleted, false),
            ),
          ).get()
        : undefined;
      columnId = remembered?.id ?? firstProjectColumn(projectId, false)?.id ?? null;
      if (!columnId) throw new Error("Project has no open column");
      lastOpenColumnId = columnId;
    }
  }

  db.transaction(() => {
    db.update(tasks).set({
      status: data.status,
      columnId,
      lastOpenColumnId,
      completedAt: data.status === "done" ? completionTime(task, now) : null,
      progress: data.status === "done" ? 100 : Math.min(task.progress, 99),
      ...(columnId !== task.columnId ? { sortOrder: nextContextTaskSortOrder(columnId) } : {}),
      updatedAt: now,
    }).where(eq(tasks.id, task.id)).run();
    if (projectId) {
      if (task.parentTaskId) syncTaskAncestors(task.id);
      syncProjectBounds(projectId);
    }
  });
  revalidateTaskViews(projectId);
}

export async function deleteTask(id: string) {
  await requireUserOrThrow();
  const task = db.select().from(tasks).where(eq(tasks.id, id)).get();
  if (!task) return;
  db.transaction((tx) => {
    deleteTaskSubtreeSideRows(tx, [id]);
    tx.delete(contextLinks)
      .where(
        and(
          eq(contextLinks.ownerType, "task"),
          eq(contextLinks.ownerId, id),
        ),
      )
      .run();
    tx.delete(tasks).where(eq(tasks.id, id)).run();
    if (task.parentTaskId) syncTaskAncestors(task.parentTaskId);
    if (task.projectId) syncProjectBounds(task.projectId);
  });
  if (task.projectId) revalidatePath(`/projects/${task.projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
}

const reparentSchema = z.object({
  taskId: z.string().min(1),
  parentTaskId: z.string().nullable().default(null),
  beforeTaskId: z.string().nullable().optional().default(null),
});

/**
 * Moves a task to a new parent and position (R5), used by indent/outdent and by
 * dragging rows in the tree pane. Both the old and the new parent are rolled up
 * afterwards, so a summary that just lost its last child keeps the dates it had
 * and becomes an ordinary task again.
 */
export async function reparentTask(
  input: z.input<typeof reparentSchema>,
): Promise<{ ok: true } | ScheduleFailure> {
  await requireUserOrThrow();
  const data = reparentSchema.parse(input);
  let projectId: string;
  try {
    projectId = reparentTaskRows(data);
  } catch (error) {
    return scheduleFailure(error);
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  return { ok: true };
}

/** Validates and writes a reparent; returns the task's project. */
function reparentTaskRows(data: z.infer<typeof reparentSchema>): string {
  const task = db.select().from(tasks).where(eq(tasks.id, data.taskId)).get();
  if (!task) throw new ScheduleError("not-found", "Task not found");
  if (!task.projectId) throw new ScheduleError("invalid", "Only project tasks can be nested");
  const projectId = task.projectId;


  const projectTasks = projectHierarchyRows(projectId);
  assertTaskHierarchy(
    projectTasks.map((row) => ({
      id: row.id,
      projectId,
      parentTaskId: row.parentTaskId,
      isMilestone: row.isMilestone,
    })),
    {
      id: task.id,
      projectId: task.projectId,
      parentTaskId: data.parentTaskId,
      isMilestone: task.isMilestone,
    },
  );
  if (taskDescendants(projectTasks, task.id).length > 0 && task.isMilestone) {
    throw new ScheduleError("hierarchy", "Milestones cannot contain subtasks");
  }

  const siblings = db
    .select({ id: tasks.id, sortOrder: tasks.sortOrder })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        data.parentTaskId
          ? eq(tasks.parentTaskId, data.parentTaskId)
          : isNull(tasks.parentTaskId),
      ),
    )
    .orderBy(asc(tasks.sortOrder))
    .all()
    .filter((sibling) => sibling.id !== task.id);
  const anchor = data.beforeTaskId
    ? siblings.findIndex((sibling) => sibling.id === data.beforeTaskId)
    : -1;
  if (data.beforeTaskId && anchor < 0) throw new ScheduleError("stale", "The destination moved; refresh and try again");
  const orderedIds = siblings.map((sibling) => sibling.id);
  orderedIds.splice(anchor < 0 ? orderedIds.length : anchor, 0, task.id);
  const sortOrder = (orderedIds.indexOf(task.id) + 1) * SORT_GAP;
  const nextHierarchy = projectTasks.map((row) => row.id === task.id ? { ...row, parentTaskId: data.parentTaskId } : row);
  for (const dependency of db.select().from(taskDependencies).all()) {
    try { assertDependencyEndpoints(projectTasks, dependency); } catch { continue; }
    assertDependencyEndpoints(nextHierarchy, dependency);
  }

  db.transaction(() => {
    // Renumber destination siblings to prevent collisions after repeated insertions.
    orderedIds.forEach((id, index) => {
      db.update(tasks).set({ sortOrder: (index + 1) * SORT_GAP }).where(eq(tasks.id, id)).run();
    });
    db.update(tasks)
      .set({
        parentTaskId: data.parentTaskId,
        sortOrder,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, task.id))
      .run();
    if (data.parentTaskId && data.parentTaskId !== task.parentTaskId) {
      db.update(tasks)
        .set({ constraintType: "asap", constraintDate: null, updatedAt: new Date() })
        .where(eq(tasks.id, data.parentTaskId))
        .run();
      syncTaskAncestors(data.parentTaskId);
    }
    if (task.parentTaskId !== data.parentTaskId) {
      if (task.parentTaskId) syncTaskAncestors(task.parentTaskId);
      syncTaskAncestors(task.id);
      syncProjectBounds(projectId);
    }
  });
  return projectId;
}
