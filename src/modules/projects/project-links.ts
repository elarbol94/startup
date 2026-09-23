import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  projectColumns,
  projectDependencies,
  projectTaskDependencies,
  projects,
  taskDependencies,
  tasks,
} from "@/db/schema";
import { addCalendarDays, calendarDayDistance } from "@/modules/projects/schedule";
import { deleteProjectSideRows } from "./cleanup";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

/** Paths that show project data: portfolio, board, dashboard and calendar. */
export function revalidateProjectPaths(...projectIds: Array<string | null | undefined>) {
  revalidatePath("/projects");
  for (const id of new Set(projectIds)) if (id) revalidatePath(`/projects/${id}`);
  revalidatePath("/");
  revalidatePath("/calendar");
}

/** Applies project successors after their predecessor's finish moves. */
export function cascadeProjectSuccessors(predecessorType: "project" | "task", predecessorId: string, visited = new Set<string>()) {
  const predecessorDueDate = predecessorType === "project"
    ? db.select({ dueDate: projects.targetEndDate }).from(projects).where(eq(projects.id, predecessorId)).get()?.dueDate
    : db.select({ dueDate: tasks.dueDate }).from(tasks).where(eq(tasks.id, predecessorId)).get()?.dueDate;
  if (!predecessorDueDate) return;
  const requiredStart = addCalendarDays(predecessorDueDate, 1);
  const links = db.select().from(projectDependencies).where(and(eq(projectDependencies.predecessorType, predecessorType), eq(projectDependencies.predecessorId, predecessorId))).all();
  for (const link of links) {
    if (visited.has(link.successorProjectId)) continue;
    visited.add(link.successorProjectId);
    const successor = db.select().from(projects).where(eq(projects.id, link.successorProjectId)).get();
    if (!successor?.plannedStartDate || !successor.targetEndDate || successor.plannedStartDate >= requiredStart) continue;
    const shift = calendarDayDistance(successor.plannedStartDate, requiredStart);
    db.transaction((tx) => {
      tx.update(projects).set({ plannedStartDate: requiredStart, targetEndDate: addCalendarDays(successor.targetEndDate!, shift), updatedAt: new Date() }).where(eq(projects.id, successor.id)).run();
      const projectTasks = tx.select().from(tasks).where(eq(tasks.projectId, successor.id)).all();
      for (const task of projectTasks) {
        if (!task.startDate || !task.dueDate) continue;
        tx.update(tasks).set({ startDate: addCalendarDays(task.startDate, shift), dueDate: addCalendarDays(task.dueDate, shift), updatedAt: new Date() }).where(eq(tasks.id, task.id)).run();
      }
    });
    cascadeProjectSuccessors("project", successor.id, visited);
  }
  if (predecessorType === "project") {
    for (const link of db.select().from(projectTaskDependencies).where(eq(projectTaskDependencies.predecessorProjectId, predecessorId)).all()) {
      const successor = db.select().from(tasks).where(eq(tasks.id, link.successorTaskId)).get();
      if (!successor?.startDate || !successor.dueDate || successor.startDate >= requiredStart) continue;
      const shift = calendarDayDistance(successor.startDate, requiredStart);
      db.update(tasks).set({ startDate: requiredStart, dueDate: addCalendarDays(successor.dueDate, shift), updatedAt: new Date() }).where(eq(tasks.id, successor.id)).run();
      cascadeProjectSuccessors("task", successor.id, visited);
    }
  }
}

/** Project that owns a predecessor endpoint, or null when it doesn't exist. */
export function predecessorProjectId(
  predecessor: { type: "project" | "task"; id: string },
  executor: Executor = db,
): string | null {
  if (predecessor.type === "project") {
    return executor.select({ id: projects.id }).from(projects).where(eq(projects.id, predecessor.id)).get()?.id ?? null;
  }
  const task = executor.select({ projectId: tasks.projectId }).from(tasks).where(eq(tasks.id, predecessor.id)).get();
  return task?.projectId ?? null;
}

/**
 * True when making `predecessor` a predecessor of `projectId` would close a
 * loop in the project-level schedule graph (a project may not wait for itself).
 */
export function projectLinkCreatesCycle(
  projectId: string,
  predecessor: { type: "project" | "task"; id: string },
  executor: Executor = db,
): boolean {
  const start = predecessorProjectId(predecessor, executor);
  if (!start) return false;
  // Edges: predecessor project -> successor project.
  const edges = new Map<string, Set<string>>();
  const add = (from: string | null, to: string | null) => {
    if (!from || !to) return;
    const set = edges.get(from) ?? new Set<string>();
    set.add(to);
    edges.set(from, set);
  };
  for (const link of executor
    .select({
      predecessorType: projectDependencies.predecessorType,
      predecessorId: projectDependencies.predecessorId,
      successorProjectId: projectDependencies.successorProjectId,
      taskProjectId: tasks.projectId,
    })
    .from(projectDependencies)
    .leftJoin(tasks, and(eq(projectDependencies.predecessorType, "task"), eq(tasks.id, projectDependencies.predecessorId)))
    .all()) {
    add(link.predecessorType === "project" ? link.predecessorId : link.taskProjectId, link.successorProjectId);
  }
  for (const link of executor
    .select({ from: projectTaskDependencies.predecessorProjectId, to: tasks.projectId })
    .from(projectTaskDependencies)
    .innerJoin(tasks, eq(tasks.id, projectTaskDependencies.successorTaskId))
    .all()) {
    add(link.from, link.to);
  }
  // A cycle exists when projectId can already reach the predecessor's project.
  const seen = new Set<string>();
  const stack = [projectId];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === start) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of edges.get(current) ?? []) stack.push(next);
  }
  return false;
}

export type ProjectLinkSummary = {
  predecessors: Array<{
    id: string;
    type: "project" | "task";
    targetId: string;
    title: string;
    projectName: string | null;
    dueDate: string | null;
  }>;
  successors: Array<{ id: string; projectId: string; title: string }>;
};

/** Predecessor and successor links stored in project_dependencies. */
export function listProjectDependencyLinks(projectId: string): ProjectLinkSummary {
  const predecessorRows = db
    .select()
    .from(projectDependencies)
    .where(eq(projectDependencies.successorProjectId, projectId))
    .all();
  const predecessors: ProjectLinkSummary["predecessors"] = [];
  for (const row of predecessorRows) {
    if (row.predecessorType === "project") {
      const project = db.select({ name: projects.name, dueDate: projects.targetEndDate }).from(projects).where(eq(projects.id, row.predecessorId)).get();
      predecessors.push({ id: row.id, type: "project", targetId: row.predecessorId, title: project?.name ?? "?", projectName: null, dueDate: project?.dueDate ?? null });
    } else {
      const task = db
        .select({ title: tasks.title, dueDate: tasks.dueDate, projectName: projects.name })
        .from(tasks)
        .leftJoin(projects, eq(projects.id, tasks.projectId))
        .where(eq(tasks.id, row.predecessorId))
        .get();
      predecessors.push({ id: row.id, type: "task", targetId: row.predecessorId, title: task?.title ?? "?", projectName: task?.projectName ?? null, dueDate: task?.dueDate ?? null });
    }
  }
  const successors = db
    .select({ id: projectDependencies.id, projectId: projects.id, title: projects.name })
    .from(projectDependencies)
    .innerJoin(projects, eq(projects.id, projectDependencies.successorProjectId))
    .where(and(eq(projectDependencies.predecessorType, "project"), eq(projectDependencies.predecessorId, projectId)))
    .all();
  return { predecessors, successors };
}

export type ProjectImpact = {
  tasks: number;
  openTasks: number;
  columns: number;
  dependencies: number;
};

/** Counts what deleting (or archiving) a project affects. */
export function projectImpact(projectId: string): ProjectImpact {
  const count = (value: { value: number } | undefined) => Number(value?.value ?? 0);
  const projectTaskIds = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
  const taskCount = count(db.select({ value: sql<number>`count(*)` }).from(tasks).where(eq(tasks.projectId, projectId)).get());
  const openTasks = count(
    db.select({ value: sql<number>`count(*)` })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), isNull(tasks.parentTaskId), ne(tasks.status, "done")))
      .get(),
  );
  const columns = count(db.select({ value: sql<number>`count(*)` }).from(projectColumns).where(eq(projectColumns.projectId, projectId)).get());
  const projectLinks = count(
    db.select({ value: sql<number>`count(*)` })
      .from(projectDependencies)
      .where(or(
        eq(projectDependencies.successorProjectId, projectId),
        and(eq(projectDependencies.predecessorType, "project"), eq(projectDependencies.predecessorId, projectId)),
        and(eq(projectDependencies.predecessorType, "task"), inArray(projectDependencies.predecessorId, projectTaskIds)),
      ))
      .get(),
  );
  const projectTaskLinks = count(
    db.select({ value: sql<number>`count(*)` })
      .from(projectTaskDependencies)
      .where(or(
        eq(projectTaskDependencies.predecessorProjectId, projectId),
        inArray(projectTaskDependencies.successorTaskId, projectTaskIds),
      ))
      .get(),
  );
  const taskLinks = count(
    db.select({ value: sql<number>`count(*)` })
      .from(taskDependencies)
      .where(or(
        inArray(taskDependencies.predecessorTaskId, projectTaskIds),
        inArray(taskDependencies.successorTaskId, projectTaskIds),
      ))
      .get(),
  );
  return { tasks: taskCount, openTasks, columns, dependencies: projectLinks + projectTaskLinks + taskLinks };
}

/**
 * Deletes a project with everything that references it. Rows with a foreign
 * key cascade on their own; polymorphic references (context links and
 * project dependencies whose predecessor is this project or one of its tasks)
 * are removed explicitly so no orphan rows remain.
 */
export function deleteProjectRows(tx: Tx, projectId: string) {
  deleteProjectSideRows(tx, projectId);
  tx.delete(projects).where(eq(projects.id, projectId)).run();
}
