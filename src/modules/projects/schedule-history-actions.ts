"use server";

// Undo/redo of recorded portfolio schedule change sets. Used by portfolio-client.tsx
// and the calendar module.
import { eq, isNotNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  projectScheduleChangeItems,
  projects,
  scheduleChangeItems,
  scheduleChangeSets,
  taskDependencies,
  tasks,
} from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import {
  dependencyConflictEdgeKeys,
  hasScheduleCycle,
  scheduleContainmentViolations,
} from "@/modules/projects/schedule";
import { ScheduleError, scheduleFailure, type ScheduleFailure } from "./schedule-errors";

/** Runs a synchronous write and reports an expected scheduling failure. */
function scheduleTry(run: () => void): ScheduleFailure | null {
  try {
    run();
    return null;
  } catch (error) {
    return scheduleFailure(error);
  }
}

export async function revertPortfolioScheduleChange(
  changeSetId: string,
): Promise<{ ok: true } | ScheduleFailure> {
  await requireUserOrThrow();
  const failure = scheduleTry(() => db.transaction((tx) => {
    const set = tx
      .select()
      .from(scheduleChangeSets)
      .where(eq(scheduleChangeSets.id, changeSetId))
      .get();
    if (!set || set.status !== "applied") {
      throw new ScheduleError("unavailable", "Change cannot be undone");
    }
    const items = tx
      .select()
      .from(scheduleChangeItems)
      .where(eq(scheduleChangeItems.changeSetId, changeSetId))
      .all();
    const projectItems = tx
      .select()
      .from(projectScheduleChangeItems)
      .where(eq(projectScheduleChangeItems.changeSetId, changeSetId))
      .all();
    const currentTasks = tx
    .select({
        id: tasks.id,
        projectId: sql<string>`${tasks.projectId}`,
        parentTaskId: tasks.parentTaskId,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        progress: tasks.progress,
        isMilestone: tasks.isMilestone,
        constraintType: tasks.constraintType,
        constraintDate: tasks.constraintDate,
      })
      .from(tasks)
      .where(isNotNull(tasks.projectId))
      .all();
    const currentProjects = tx
      .select({
        id: projects.id,
        startDate: projects.plannedStartDate,
        dueDate: projects.targetEndDate,
      })
      .from(projects)
      .all();
    const dependencies = tx.select().from(taskDependencies).all();
    const currentTaskById = new Map(
      currentTasks.map((task) => [task.id, task]),
    );
    const currentProjectById = new Map(
      currentProjects.map((project) => [project.id, project]),
    );

    for (const item of items) {
      const current = currentTaskById.get(item.taskId);
      if (
        !current ||
        current.startDate !== item.afterStartDate ||
        current.dueDate !== item.afterDueDate
      ) {
        throw new ScheduleError("blocked", "A later edit prevents undo");
      }
    }
    for (const item of projectItems) {
      const current = currentProjectById.get(item.projectId);
      if (
        !current ||
        current.startDate !== item.afterStartDate ||
        current.dueDate !== item.afterDueDate
      ) {
        throw new ScheduleError("blocked", "A later edit prevents undo");
      }
    }

    const taskItemById = new Map(items.map((item) => [item.taskId, item]));
    const projectItemById = new Map(
      projectItems.map((item) => [item.projectId, item]),
    );
    const restoredTasks = currentTasks.map((task) => {
      const item = taskItemById.get(task.id);
      return item
        ? {
            ...task,
            startDate: item.beforeStartDate,
            dueDate: item.beforeDueDate,
          }
        : task;
    });
    const restoredProjects = currentProjects.map((project) => {
      const item = projectItemById.get(project.id);
      return item
        ? {
            ...project,
            startDate: item.beforeStartDate,
            dueDate: item.beforeDueDate,
          }
        : project;
    });
    if (hasScheduleCycle(restoredTasks, dependencies)) {
      throw new ScheduleError("blocked", "A later hierarchy edit prevents undo");
    }
    if (
      scheduleContainmentViolations(restoredTasks, restoredProjects).length > 0
    ) {
      throw new ScheduleError("blocked", "Newly nested work prevents undo");
    }
    const currentConflicts = dependencyConflictEdgeKeys(
      currentTasks,
      dependencies,
    );
    const restoredConflicts = dependencyConflictEdgeKeys(
      restoredTasks,
      dependencies,
    );
    if (
      [...restoredConflicts].some((conflict) => !currentConflicts.has(conflict))
    ) {
      throw new ScheduleError("blocked", "A later dependency prevents undo");
    }

    for (const item of items) {
      tx.update(tasks)
        .set({
          startDate: item.beforeStartDate,
          dueDate: item.beforeDueDate,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, item.taskId))
        .run();
    }
    for (const item of projectItems) {
      tx.update(projects)
        .set({
          plannedStartDate: item.beforeStartDate,
          targetEndDate: item.beforeDueDate,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, item.projectId))
        .run();
    }
    tx.update(scheduleChangeSets)
      .set({ status: "reverted", revertedAt: new Date() })
      .where(eq(scheduleChangeSets.id, changeSetId))
      .run();
  }));
  if (failure) return failure;
  revalidatePath("/projects");
  return { ok: true };
}

/** Reapplies a change set that was just reverted, with the same safeguards as undo. */
export async function reapplyPortfolioScheduleChange(
  changeSetId: string,
): Promise<{ ok: true } | ScheduleFailure> {
  await requireUserOrThrow();
  const failure = scheduleTry(() => db.transaction((tx) => {
    const set = tx
      .select()
      .from(scheduleChangeSets)
      .where(eq(scheduleChangeSets.id, changeSetId))
      .get();
    if (!set || set.status !== "reverted") {
      throw new ScheduleError("unavailable", "Change cannot be redone");
    }
    const items = tx
      .select()
      .from(scheduleChangeItems)
      .where(eq(scheduleChangeItems.changeSetId, changeSetId))
      .all();
    const projectItems = tx
      .select()
      .from(projectScheduleChangeItems)
      .where(eq(projectScheduleChangeItems.changeSetId, changeSetId))
      .all();
    const currentTasks = tx
      .select({
        id: tasks.id,
        projectId: sql<string>`${tasks.projectId}`,
        parentTaskId: tasks.parentTaskId,
        startDate: tasks.startDate,
        dueDate: tasks.dueDate,
        progress: tasks.progress,
        isMilestone: tasks.isMilestone,
        constraintType: tasks.constraintType,
        constraintDate: tasks.constraintDate,
      })
      .from(tasks)
      .where(isNotNull(tasks.projectId))
      .all();
    const currentProjects = tx
      .select({
        id: projects.id,
        startDate: projects.plannedStartDate,
        dueDate: projects.targetEndDate,
      })
      .from(projects)
      .all();
    const dependencies = tx.select().from(taskDependencies).all();
    const currentTaskById = new Map(currentTasks.map((task) => [task.id, task]));
    const currentProjectById = new Map(
      currentProjects.map((project) => [project.id, project]),
    );

    for (const item of items) {
      const current = currentTaskById.get(item.taskId);
      if (
        !current ||
        current.startDate !== item.beforeStartDate ||
        current.dueDate !== item.beforeDueDate
      ) {
        throw new ScheduleError("blocked", "A later edit prevents redo");
      }
    }
    for (const item of projectItems) {
      const current = currentProjectById.get(item.projectId);
      if (
        !current ||
        current.startDate !== item.beforeStartDate ||
        current.dueDate !== item.beforeDueDate
      ) {
        throw new ScheduleError("blocked", "A later edit prevents redo");
      }
    }

    const taskItemById = new Map(items.map((item) => [item.taskId, item]));
    const projectItemById = new Map(
      projectItems.map((item) => [item.projectId, item]),
    );
    const reappliedTasks = currentTasks.map((task) => {
      const item = taskItemById.get(task.id);
      return item
        ? { ...task, startDate: item.afterStartDate, dueDate: item.afterDueDate }
        : task;
    });
    const reappliedProjects = currentProjects.map((project) => {
      const item = projectItemById.get(project.id);
      return item
        ? { ...project, startDate: item.afterStartDate, dueDate: item.afterDueDate }
        : project;
    });
    if (hasScheduleCycle(reappliedTasks, dependencies)) {
      throw new ScheduleError("blocked", "A later hierarchy edit prevents redo");
    }
    if (scheduleContainmentViolations(reappliedTasks, reappliedProjects).length > 0) {
      throw new ScheduleError("blocked", "Newly nested work prevents redo");
    }
    const currentConflicts = dependencyConflictEdgeKeys(currentTasks, dependencies);
    const reappliedConflicts = dependencyConflictEdgeKeys(reappliedTasks, dependencies);
    if (
      [...reappliedConflicts].some((conflict) => !currentConflicts.has(conflict))
    ) {
      throw new ScheduleError("blocked", "A later dependency prevents redo");
    }

    for (const item of items) {
      tx.update(tasks)
        .set({
          startDate: item.afterStartDate,
          dueDate: item.afterDueDate,
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, item.taskId))
        .run();
    }
    for (const item of projectItems) {
      tx.update(projects)
        .set({
          plannedStartDate: item.afterStartDate,
          targetEndDate: item.afterDueDate,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, item.projectId))
        .run();
    }
    tx.update(scheduleChangeSets)
      .set({ status: "applied", revertedAt: null })
      .where(eq(scheduleChangeSets.id, changeSetId))
      .run();
  }));
  if (failure) return failure;
  revalidatePath("/projects");
  return { ok: true };
}
