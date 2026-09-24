"use server";

// Actions for tasks created from a context (wiki page, source, PDF, app route) and
// for the shared dashboard board. Used by the tasks module; deadlines built on these
// live in deadline-actions.ts.
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import {
  contextLinks,
  projectColumns,
  projects,
  taskContexts,
  tasks,
  user,
  wikiNotifications,
} from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { safeInternalRoute } from "@/lib/internal-route";
import { leafTasks, taskDescendants } from "@/modules/projects/schedule";
import { getPortfolioSchedule } from "./queries";
import { saveTaskAssignees, taskAssigneeFields } from "./assignees";
import {
  SORT_GAP,
  projectHierarchyRows,
  syncProjectBounds,
  syncTaskAncestors,
} from "./task-sync";
import { detachTaskFromProject, moveTaskSubtreeToProject } from "./task-move";
import {
  revalidateTaskViews,
  firstProjectColumn,
  nextContextTaskSortOrder,
  completionTime,
} from "./project-action-helpers";

const contextualTaskSchema = z.object({
  id: z.string().optional(),
  kind: z.enum(["task", "deadline"]).default("task"),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).default(""),
  assigneeId: z.string().nullable().default(null),
  assigneeIds: z.array(z.string().min(1)).optional(),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  startDate: z.iso.date().nullable().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  deadlineAt: z.string().datetime().nullable().default(null),
  localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  status: z.enum(["open", "done"]).default("open"),
  workflowStage: z.enum(["todo", "in_progress"]).optional(),
  // Omitted keeps the current project; null explicitly removes the project.
  projectId: z.string().nullable().optional(),
  context: z.object({
    type: z.enum(["wikiPage", "wikiSource", "pdf", "app"]),
    entityId: z.string().max(300).default(""),
    route: z.string().min(1).max(1000),
    label: z.string().max(300).default(""),
    anchorJson: z.string().max(20_000).default("{}"),
  }).nullable().default(null),
}).superRefine((data, context) => {
  if (data.kind === "task" && data.startDate && (!data.dueDate || data.dueDate < data.startDate)) {
    context.addIssue({ code: "custom", path: ["dueDate"], message: "Completion must be on or after start" });
  }
  if (data.kind === "deadline" && !data.localDate) {
    context.addIssue({
      code: "custom",
      path: ["localDate"],
      message: "Deadline date is required",
    });
  }
});

export type ContextualTaskInput = z.input<typeof contextualTaskSchema>;

export async function getContextualTaskOptions() {
  await requireUserOrThrow();
  return {
    members: db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(isNull(user.removedAt))
      .orderBy(asc(user.name))
      .all(),
    projects: db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.status, "active"))
      .orderBy(asc(projects.name))
      .all(),
  };
}

/** Authenticated schedule read used by the document task planner. */
export async function getContextualProjectSchedule(projectId: string) {
  await requireUserOrThrow();
  const id = z.string().min(1).parse(projectId);
  const schedule = getPortfolioSchedule();
  if (!schedule.projects.some((project) => project.id === id)) throw new Error("Active project not found");
  // Keep the full graph for the same cross-project conflict/cascade checks as
  // the portfolio. The embedded view limits visible rows to this project.
  return schedule;
}

export async function getContextualTaskForEdit(id: string) {
  await requireUserOrThrow();
  const taskId = z.string().min(1).parse(id);
  const task = db
    .select({
      id: tasks.id,
      title: tasks.title,
      ...taskAssigneeFields,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      status: tasks.status,
      projectId: tasks.projectId,
    })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.kind, "task")))
    .get();
  if (!task) throw new Error("Task not found");
  return task;
}

function notifyTaskAssignment(input: {
  taskId: string;
  actorId: string;
  previousAssigneeId: string | null | undefined;
  assigneeId: string | null;
  pageId?: string | null;
}) {
  if (
    input.assigneeId &&
    input.assigneeId !== input.actorId &&
    input.assigneeId !== input.previousAssigneeId
  ) {
    db.insert(wikiNotifications).values({
      userId: input.assigneeId,
      actorId: input.actorId,
      type: "assignment",
      pageId: input.pageId ?? null,
      taskId: input.taskId,
    }).run();
  }
}

export async function upsertContextualTask(
  input: ContextualTaskInput,
): Promise<{ id: string }> {
  const currentUser = await requireUserOrThrow();
  const data = contextualTaskSchema.parse(input);
  const existing = data.id
    ? db.select().from(tasks).where(eq(tasks.id, data.id)).get()
    : undefined;
  if (data.id && !existing) throw new Error("Task not found");
  if (data.kind === "deadline" && data.assigneeId && data.assigneeId !== existing?.assigneeId) {
    const member = db.select({ id: user.id }).from(user).where(and(eq(user.id, data.assigneeId), isNull(user.removedAt))).get();
    if (!member) throw new Error("Assignee not found");
  }

  if (existing && existing.kind !== data.kind) {
    throw new Error("Task kind cannot be changed");
  }
  // undefined keeps the current project; an explicit null removes it.
  const projectId = data.kind === "deadline"
    ? null
    : data.projectId === undefined
      ? existing?.projectId ?? null
      : data.projectId;
  if (projectId && !db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get()) {
    throw new Error("Project not found");
  }
  const sourceProjectId = existing?.projectId ?? null;
  const movesProject = Boolean(existing && sourceProjectId && projectId && sourceProjectId !== projectId);
  const detachesProject = Boolean(existing && sourceProjectId && !projectId);
  const hierarchyProjectId = sourceProjectId ?? projectId;
  if (hierarchyProjectId && existing && data.status === "done") {
    const descendants = taskDescendants(projectHierarchyRows(hierarchyProjectId), existing.id);
    if (leafTasks(descendants).some(child => !child.columnIsCompleted)) {
      throw new Error("Complete all subtasks before completing the parent");
    }
  }
  const openColumn = projectId ? firstProjectColumn(projectId, false) : undefined;
  const doneColumn = projectId ? firstProjectColumn(projectId, true) : undefined;
  if (projectId && !openColumn && !doneColumn) throw new Error("Project has no task column");
  let columnId: string | null = null;
  const now = new Date();
  let id = data.id;
  const stageColumnNames = projectId && data.workflowStage ? await dashboardColumnNames() : undefined;

  db.transaction((tx) => {
    // A project change takes the whole subtree along (or, for "no project",
    // detaches a plain task) before the edited fields are applied.
    let current = existing;
    if (existing && movesProject && projectId) {
      moveTaskSubtreeToProject(existing.id, projectId);
      current = tx.select().from(tasks).where(eq(tasks.id, existing.id)).get();
    } else if (existing && detachesProject) {
      detachTaskFromProject(existing.id);
      current = tx.select().from(tasks).where(eq(tasks.id, existing.id)).get();
    }
    const existingColumn = current?.columnId && current.projectId === projectId
      ? tx.select().from(projectColumns).where(eq(projectColumns.id, current.columnId)).get()
      : undefined;
    const desiredColumn = existingColumn && current?.status === data.status
      ? existingColumn
      : data.status === "done"
        ? doneColumn ?? openColumn
        : openColumn;
    if (projectId && !desiredColumn) throw new Error("Project has no task column");
    columnId = desiredColumn?.id ?? null;
    if (projectId && data.workflowStage) {
      columnId = dashboardColumn(projectId, data.status === "done" ? "done" : data.workflowStage, stageColumnNames).id;
    }
    const values = {
      kind: data.kind,
      projectId,
      columnId,
      lastOpenColumnId: data.status === "open"
        ? columnId
        : current?.lastOpenColumnId ?? openColumn?.id ?? null,
      title: data.title,
      description: data.kind === "deadline"
        ? data.description
        : existing?.description ?? data.description,
      assigneeId: data.kind === "deadline" ? data.assigneeId : null,
      dueDate: data.kind === "deadline" ? data.localDate : data.dueDate,
      startDate: data.kind === "deadline" ? data.localDate : data.startDate !== undefined ? data.startDate : existing?.startDate ?? null,
      deadlineAt: data.kind === "deadline" && data.deadlineAt
        ? new Date(data.deadlineAt)
        : null,
      isMilestone: data.kind === "deadline" ? true : existing?.isMilestone ?? false,
      priority: data.priority,
      status: data.status,
      workflowStage: data.workflowStage ?? existing?.workflowStage ?? "todo",
      completedAt: data.status === "done" ? existing?.completedAt ?? now : null,
      progress: data.status === "done" ? 100 : Math.min(existing?.progress ?? 0, 99),
      updatedAt: now,
    };
    if (existing && id) {
      tx.update(tasks).set({
        ...values,
        // A moved or detached task already got a slot in its new scope; only
        // a different final column needs a fresh one.
        ...((movesProject || detachesProject) && current?.columnId !== columnId
          ? { sortOrder: nextContextTaskSortOrder(columnId) }
          : {}),
      }).where(eq(tasks.id, id)).run();
    } else {
      id = tx.insert(tasks).values({
        ...values,
        parentTaskId: null,
        sortOrder: nextContextTaskSortOrder(columnId),
        createdBy: currentUser.id,
      }).returning({ id: tasks.id }).get().id;
    }

    if (!id) throw new Error("Task was not saved");
    if (data.kind === "task") saveTaskAssignees(tx, {
      taskId: id, assigneeIds: data.assigneeIds, actorId: currentUser.id,
      pageId: data.context?.type === "wikiPage" ? data.context.entityId : null,
    });
    if (data.context) {
      const context = {
        taskId: id,
        type: data.context.type,
        entityId: data.context.entityId,
        route: safeInternalRoute(data.context.route),
        label: data.context.label,
        anchorJson: data.context.anchorJson,
        updatedAt: now,
      };
      tx.insert(taskContexts).values(context).onConflictDoUpdate({
        target: taskContexts.taskId,
        set: context,
      }).run();
      tx.delete(contextLinks)
        .where(
          and(
            eq(contextLinks.ownerType, "task"),
            eq(contextLinks.ownerId, id),
            eq(contextLinks.relation, "origin"),
          ),
        )
        .run();
      const contextLink = {
        ownerType: "task" as const,
        ownerId: id,
        targetType: data.context.type,
        targetId: data.context.entityId,
        relation: "origin" as const,
        route: safeInternalRoute(data.context.route),
        label: data.context.label,
        anchorJson: data.context.anchorJson,
        createdBy: currentUser.id,
        updatedAt: now,
      };
      tx.insert(contextLinks).values(contextLink).run();
    }
  });

  if (!id) throw new Error("Task was not saved");
  if (data.kind === "deadline") notifyTaskAssignment({
    taskId: id,
    actorId: currentUser.id,
    previousAssigneeId: existing?.assigneeId,
    assigneeId: data.assigneeId,
    pageId: data.context?.type === "wikiPage" ? data.context.entityId : null,
  });
  if (projectId) {
    if (existing?.parentTaskId || movesProject) syncTaskAncestors(id);
    syncProjectBounds(projectId);
    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
  }
  if (sourceProjectId && sourceProjectId !== projectId) {
    revalidatePath(`/projects/${sourceProjectId}`);
    revalidatePath("/projects");
  }
  revalidatePath("/");
  revalidatePath("/wiki", "layout");
  revalidatePath("/calendar");
  return { id };
}

type DashboardStage = "todo" | "in_progress" | "done";

type DashboardColumnNames = Record<DashboardStage, string>;

/** Localised names for the stage columns the dashboard may have to create. */
async function dashboardColumnNames(): Promise<DashboardColumnNames> {
  const t = await getTranslations("projects");
  return { todo: t("colOpen"), in_progress: t("colInProgress"), done: t("colDone") };
}

/** Resolves a shared workflow stage without renaming any existing project column. */
function dashboardColumn(
  projectId: string,
  stage: DashboardStage,
  names: DashboardColumnNames = { todo: "Offen", in_progress: "In Arbeit", done: "Erledigt" },
) {
  const columns = db.select().from(projectColumns).where(eq(projectColumns.projectId, projectId))
    .orderBy(asc(projectColumns.sortOrder), asc(projectColumns.id)).all();
  const existing = columns.find(column => stage === "done" ? column.isCompleted : !column.isCompleted && column.workflowStage === stage);
  if (existing) return existing;
  return db.insert(projectColumns).values({
    projectId,
    name: names[stage],
    isCompleted: stage === "done",
    workflowStage: stage === "in_progress" ? "in_progress" : "todo",
    sortOrder: (columns.at(-1)?.sortOrder ?? 0) + SORT_GAP,
  }).returning().get();
}

export async function moveDashboardTask(input: { taskId: string; stage: DashboardStage }) {
  await requireUserOrThrow();
  const data = z.object({ taskId: z.string().min(1), stage: z.enum(["todo", "in_progress", "done"]) }).parse(input);
  const task = db.select().from(tasks).where(eq(tasks.id, data.taskId)).get();
  if (!task || task.kind !== "task") throw new Error("Task not found");
  const columnNames = task.projectId ? await dashboardColumnNames() : undefined;
  db.transaction(() => {
    if (task.projectId && data.stage === "done") {
      const descendants = taskDescendants(projectHierarchyRows(task.projectId), task.id);
      if (leafTasks(descendants).some(child => !child.columnIsCompleted)) {
        throw new Error("Complete all subtasks before completing the parent");
      }
    }
    const currentColumn = task.columnId ? db.select().from(projectColumns).where(eq(projectColumns.id, task.columnId)).get() : undefined;
    const sameStage = currentColumn && (data.stage === "done" ? currentColumn.isCompleted : !currentColumn.isCompleted && currentColumn.workflowStage === data.stage);
    const column = task.projectId ? sameStage ? currentColumn : dashboardColumn(task.projectId, data.stage, columnNames) : undefined;
    const now = new Date();
    db.update(tasks).set({
      columnId: column?.id ?? null,
      status: data.stage === "done" ? "done" : "open",
      workflowStage: data.stage === "done" ? task.workflowStage : data.stage,
      lastOpenColumnId: data.stage === "done" ? task.lastOpenColumnId ?? task.columnId : column?.id ?? null,
      completedAt: data.stage === "done" ? completionTime(task, now) : null,
      progress: data.stage === "done" ? 100 : Math.min(task.progress, 99),
      sortOrder: column?.id !== task.columnId ? nextContextTaskSortOrder(column?.id ?? null) : task.sortOrder,
      updatedAt: now,
    }).where(eq(tasks.id, task.id)).run();
    if (task.projectId) {
      if (task.parentTaskId) syncTaskAncestors(task.id);
      syncProjectBounds(task.projectId);
    }
  });
  revalidateTaskViews(task.projectId);
}
