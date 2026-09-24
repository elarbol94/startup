"use server";

// Project CRUD, status and ordering actions. Other project actions live in sibling
// files: task-actions.ts, contextual-task-actions.ts, board-actions.ts,
// dependency-actions.ts, schedule-change-actions.ts, schedule-history-actions.ts,
// deadline-actions.ts, column-actions.ts, project-actions.ts, delete-actions.ts and
// task-dialog-actions.ts.
import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projectColumns, projectDependencies, projects, tasks, user } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { inferScheduleEditOperation } from "@/modules/projects/schedule";
import { SORT_GAP, syncProjectBounds } from "./task-sync";
import {
  cascadeProjectSuccessors,
  deleteProjectRows,
  revalidateProjectPaths,
} from "./project-links";
import { computeSchedulePreview } from "./schedule-action-helpers";

const projectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#2563eb"),
  managerId: z.string().nullable().optional().default(null),
  plannedStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .default(null),
  targetEndDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .default(null),
  predecessor: z.object({ type: z.enum(["project", "task"]), id: z.string().min(1) }).nullable().optional().default(null),
}).superRefine((data, context) => {
  if (
    data.plannedStartDate &&
    data.targetEndDate &&
    data.targetEndDate < data.plannedStartDate
  ) {
    context.addIssue({
      code: "custom",
      path: ["targetEndDate"],
      message: "Target completion precedes planned start",
    });
  }
});

export type ProjectInput = z.input<typeof projectSchema>;

// Callers pass translated column names; the fallback uses the request locale.
export async function upsertProject(
  input: ProjectInput,
  defaultColumns?: string[],
): Promise<typeof projects.$inferSelect> {
  const actor = await requireUserOrThrow();
  const data = projectSchema.parse(input);
  if (
    data.managerId &&
    !db.select({ id: user.id }).from(user).where(eq(user.id, data.managerId)).get()
  ) {
    throw new Error("Manager not found");
  }

  if (data.id) {
    const projectId = data.id;
    const existing = db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .get();
    if (!existing) throw new Error("Project not found");
    const scheduleDatesChanged =
      existing.plannedStartDate !== data.plannedStartDate ||
      existing.targetEndDate !== data.targetEndDate;
    const schedulesProject = Boolean(
      data.plannedStartDate && data.targetEndDate && scheduleDatesChanged,
    );
    const operation =
      data.plannedStartDate && data.targetEndDate
        ? inferScheduleEditOperation(
            {
              startDate: existing.plannedStartDate,
              dueDate: existing.targetEndDate,
            },
            {
              startDate: data.plannedStartDate,
              dueDate: data.targetEndDate,
            },
          )
        : "place" as const;

    db.transaction((tx) => {
      // Keep the old dates until the shared planner has read them, while
      // persisting unrelated project edits in the same transaction.
      tx.update(projects)
        .set({
          name: data.name,
          description: data.description,
          color: data.color,
          managerId: data.managerId,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, projectId))
        .run();
      if (
        schedulesProject &&
        data.plannedStartDate &&
        data.targetEndDate
      ) {
        const preview = computeSchedulePreview(
          {
            entityType: "project",
            entityId: projectId,
            operation,
            startDate: data.plannedStartDate,
            dueDate: data.targetEndDate,
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
        tx.update(projects)
          .set({
            plannedStartDate: data.plannedStartDate,
            targetEndDate: data.targetEndDate,
            updatedAt: new Date(),
          })
          .where(eq(projects.id, projectId))
          .run();
      }
      syncProjectBounds(projectId);
    });
    if (scheduleDatesChanged) cascadeProjectSuccessors("project", projectId);
    revalidateProjectPaths(projectId);
    return db.select().from(projects).where(eq(projects.id, projectId)).get()!;
  }

  const predecessor = data.predecessor;
  if (predecessor) {
    const exists = predecessor.type === "project"
      ? db.select({ id: projects.id }).from(projects).where(eq(projects.id, predecessor.id)).get()
      : db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, predecessor.id)).get();
    if (!exists) throw new Error("Predecessor not found");
  }

  const columnNames = projectColumnNamesSchema
    .parse(defaultColumns ?? (await defaultProjectColumnNames()))
    .map((name) => name.trim())
    .filter((name) => name.length > 0);
  if (columnNames.length === 0) throw new Error("A project needs at least one column");

  const row = db.transaction((tx) => {
    const created = tx
      .insert(projects)
      .values({
        name: data.name,
        description: data.description,
        color: data.color,
        managerId: data.managerId,
        plannedStartDate: data.plannedStartDate,
        targetEndDate: data.targetEndDate,
        createdBy: actor.id,
      })
      .returning({ id: projects.id })
      .get();

    if (predecessor) {
      tx.insert(projectDependencies).values({
        predecessorType: predecessor.type,
        predecessorId: predecessor.id,
        successorProjectId: created.id,
      }).run();
    }

    tx.insert(projectColumns)
      .values(
        columnNames.map((name, index) => ({
          projectId: created.id,
          name,
          sortOrder: (index + 1) * SORT_GAP,
          isCompleted: index === columnNames.length - 1,
          workflowStage: index === 0 ? "todo" as const : "in_progress" as const,
        })),
      )
      .run();
    return created;
  });

  if (predecessor) cascadeProjectSuccessors(predecessor.type, predecessor.id);

  revalidateProjectPaths(row.id);
  return db.select().from(projects).where(eq(projects.id, row.id)).get()!;
}

const projectColumnNamesSchema = z.array(z.string().max(100)).max(10);

/** Default board columns in the requesting user's language. */
async function defaultProjectColumnNames(): Promise<string[]> {
  try {
    const { getTranslations } = await import("next-intl/server");
    const t = await getTranslations("projects");
    return [t("colOpen"), t("colInProgress"), t("colDone")];
  } catch {
    // Outside a request (scripts, tests) there is no locale; use the primary UI language.
    return ["Offen", "In Arbeit", "Erledigt"];
  }
}

const projectIdSchema = z.string().min(1).max(128);

export async function setProjectStatus(id: string, status: "active" | "archived") {
  await requireUserOrThrow();
  const projectId = projectIdSchema.parse(id);
  const nextStatus = z.enum(["active", "archived"]).parse(status);
  db.update(projects)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .run();
  revalidateProjectPaths(projectId);
}

/**
 * Deletes a project, its columns, tasks and every dependency or context link
 * that points at the project or one of its tasks, in one transaction.
 */
export async function deleteProject(id: string) {
  await requireUserOrThrow();
  const projectId = projectIdSchema.parse(id);
  db.transaction((tx) => deleteProjectRows(tx, projectId));
  revalidateProjectPaths(projectId);
}

const projectOrderSchema = z.object({ projectId: z.string().min(1), beforeProjectId: z.string().min(1).nullable() });

export async function reorderProject(input: z.input<typeof projectOrderSchema>) {
  await requireUserOrThrow();
  const data = projectOrderSchema.parse(input);
  db.transaction(() => {
    const ordered = db.select().from(projects).orderBy(asc(projects.sortOrder), asc(projects.createdAt), asc(projects.id)).all();
    if (!ordered.some((p) => p.id === data.projectId)) throw new Error("Project not found");
    if (data.beforeProjectId === data.projectId) return;
    const ids = ordered.filter((p) => p.id !== data.projectId).map((p) => p.id);
    const index = data.beforeProjectId ? ids.indexOf(data.beforeProjectId) : ids.length;
    if (index < 0) throw new Error("Destination project not found");
    ids.splice(index, 0, data.projectId);
    ids.forEach((id, i) => db.update(projects).set({ sortOrder: (i + 1) * SORT_GAP }).where(eq(projects.id, id)).run());
  });
  revalidatePath("/projects");
}
