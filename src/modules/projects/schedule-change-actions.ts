"use server";

// Portfolio schedule edit actions: authoritative previews, applies (recorded as change
// sets) and fit-to-children. Used by portfolio-client.tsx and the calendar module.
import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  projectScheduleChangeItems,
  projects,
  scheduleChangeItems,
  scheduleChangeSets,
  tasks,
} from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import {
  type ScheduleEntityChange,
  type SchedulePreview,
} from "@/modules/projects/schedule";
import { ScheduleError, scheduleFailure, type ScheduleFailure } from "./schedule-errors";
import {
  scheduleMoveSchema,
  scheduleApplySchema,
  computeLinkedSchedulePreview,
} from "./schedule-action-helpers";

/**
 * Keeps the older contract (throws on failure) because its only caller, the
 * project row menu, still reads `changeSetId` directly. Prefer the typed
 * result of `applyPortfolioScheduleChange` for new callers.
 */
export async function fitProjectToTasks(projectId: string) {
  const result = await applyPortfolioScheduleChange({
    entityType: "project",
    entityId: projectId,
    operation: "fit",
  });
  if (!result.ok) throw new Error(`Fit failed: ${result.code}`);
  return result;
}

export async function fitTaskToChildren(taskId: string) {
  return applyPortfolioScheduleChange({
    entityType: "task",
    entityId: taskId,
    operation: "fit",
  });
}

export type PortfolioScheduleEditInput = z.input<typeof scheduleMoveSchema>;

export async function previewPortfolioScheduleChange(
  input: z.infer<typeof scheduleMoveSchema>,
) {
  await requireUserOrThrow();
  const data = scheduleMoveSchema.parse(input);
  const { preview } = computeLinkedSchedulePreview(data);
  const taskIds = preview.changes
    .filter((change) => change.entityType === "task")
    .map((change) => change.entityId);
  const projectIds = preview.changes
    .filter((change) => change.entityType === "project")
    .map((change) => change.entityId);
  const titles = [
    ...(taskIds.length === 0
      ? []
      : db
          .select({ id: tasks.id, title: tasks.title })
          .from(tasks)
          .where(inArray(tasks.id, taskIds))
          .all()),
    ...(projectIds.length === 0
      ? []
      : db
          .select({ id: projects.id, title: projects.name })
          .from(projects)
          .where(inArray(projects.id, projectIds))
          .all()),
  ];
  const titleById = new Map(titles.map((entity) => [entity.id, entity.title]));
  return {
    ...preview,
    changes: preview.changes.map((change) => ({
      ...change,
      title: titleById.get(change.entityId) ?? "",
    })),
  };
}

function canonicalChanges(
  changes: Pick<
    ScheduleEntityChange,
    | "entityType"
    | "entityId"
    | "beforeStartDate"
    | "beforeDueDate"
    | "afterStartDate"
    | "afterDueDate"
  >[],
): string {
  return JSON.stringify(
    changes
      .map((change) => ({
        entityType: change.entityType,
        entityId: change.entityId,
        beforeStartDate: change.beforeStartDate,
        beforeDueDate: change.beforeDueDate,
        afterStartDate: change.afterStartDate,
        afterDueDate: change.afterDueDate,
      }))
      .sort((left, right) =>
        `${left.entityType}:${left.entityId}`.localeCompare(
          `${right.entityType}:${right.entityId}`,
        ),
      ),
  );
}

export type ScheduleApplyResult =
  | {
      ok: true;
      changeSetId: string | null;
      changes: ScheduleEntityChange[];
      preview: SchedulePreview;
    }
  | ScheduleFailure;

export async function applyPortfolioScheduleChange(
  input: z.input<typeof scheduleApplySchema>,
): Promise<ScheduleApplyResult> {
  const user = await requireUserOrThrow();
  const data = scheduleApplySchema.parse(input);
  if (data.operation !== "fit" && !data.expectedPreview) {
    // Confirm the current schedule preview before saving.
    return { ok: false, code: "invalid" };
  }

  let result: { changeSetId: string | null; changes: ScheduleEntityChange[]; preview: SchedulePreview };
  try {
    result = db.transaction((tx) => applyScheduleRows(tx, data, user.id));
  } catch (error) {
    return scheduleFailure(error);
  }
  if (result.changeSetId) revalidatePath("/projects");
  return { ok: true, ...result };
}

function applyScheduleRows(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  data: z.infer<typeof scheduleApplySchema>,
  userId: string,
) {
  // Read, recompute, compare, and write on the same SQLite transaction
  // snapshot. Row-level before checks below remain a second line of defense.
  // The client previews without project-level links, so its expectation
  // may match either the bare edit or the edit with pushed successors.
  const { core, preview } = computeLinkedSchedulePreview(data, tx);
  const changes = preview.changes;
  if (data.expectedPreview) {
    const expected = canonicalChanges(data.expectedPreview.changes);
    if (
      expected !== canonicalChanges(core.changes) &&
      expected !== canonicalChanges(changes)
    ) {
      throw new ScheduleError("stale", "Schedule preview is out of date");
    }
  }
  if (changes.length === 0) {
    return { changeSetId: null, changes, preview };
  }
  const changeSet = tx
    .insert(scheduleChangeSets)
    .values({ createdBy: userId })
    .returning({ id: scheduleChangeSets.id })
    .get();
  const taskChanges = changes.filter(
    (change) => change.entityType === "task",
  );
  const projectChanges = changes.filter(
    (change) => change.entityType === "project",
  );
  if (taskChanges.length > 0) {
    tx.insert(scheduleChangeItems)
      .values(
        taskChanges.map((change) => ({
        changeSetId: changeSet.id,
        taskId: change.entityId,
        beforeStartDate: change.beforeStartDate,
        beforeDueDate: change.beforeDueDate,
        afterStartDate: change.afterStartDate,
        afterDueDate: change.afterDueDate,
        })),
      )
      .run();
  }
  if (projectChanges.length > 0) {
    tx.insert(projectScheduleChangeItems)
      .values(
        projectChanges.map((change) => ({
          changeSetId: changeSet.id,
          projectId: change.entityId,
          beforeStartDate: change.beforeStartDate,
          beforeDueDate: change.beforeDueDate,
          afterStartDate: change.afterStartDate,
          afterDueDate: change.afterDueDate,
        })),
      )
      .run();
  }
  for (const change of taskChanges) {
    const current = tx
      .select({
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
      })
      .from(tasks)
      .where(eq(tasks.id, change.entityId))
      .get();
    if (
      !current ||
      current.startDate !== change.beforeStartDate ||
      current.dueDate !== change.beforeDueDate
    ) {
      throw new ScheduleError("stale", "Schedule changed in another session");
    }
    tx.update(tasks)
      .set({
        startDate: change.afterStartDate,
        dueDate: change.afterDueDate,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, change.entityId))
      .run();
  }
  for (const change of projectChanges) {
    const current = tx
      .select({
        startDate: projects.plannedStartDate,
        dueDate: projects.targetEndDate,
      })
      .from(projects)
      .where(eq(projects.id, change.entityId))
      .get();
    if (
      !current ||
      current.startDate !== change.beforeStartDate ||
      current.dueDate !== change.beforeDueDate
    ) {
      throw new ScheduleError("stale", "Schedule changed in another session");
    }
    tx.update(projects)
      .set({
        plannedStartDate: change.afterStartDate,
        targetEndDate: change.afterDueDate,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, change.entityId))
      .run();
  }
  return { changeSetId: changeSet.id, changes, preview };
}
