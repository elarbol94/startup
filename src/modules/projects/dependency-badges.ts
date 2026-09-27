// What a project waits for and what it holds up, for the badges in the project
// header. Finished predecessors are left out: only open waits are worth a badge.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  projectDependencies,
  projectTaskDependencies,
  projects,
  tasks,
} from "@/db/schema";

export type BadgeProject = { id: string; name: string; color: string; archived: boolean };

export type WaitingForBadge = {
  key: string;
  /** Predecessor project, or the project of the predecessor task. */
  project: BadgeProject | null;
  /** Set when the predecessor is a single task. */
  task: { id: string; title: string } | null;
  /** Title of this project's task that waits, when only one task waits. */
  via: string | null;
  dueDate: string | null;
  late: boolean;
};

export type BlockingBadge = {
  project: BadgeProject;
  /** This project's task the other project waits for, if not the whole project. */
  via: string | null;
};

export type DependencyBadges = { waitingFor: WaitingForBadge[]; blocks: BlockingBadge[] };

const projectFields = {
  id: projects.id,
  name: projects.name,
  color: projects.color,
  status: projects.status,
  targetEndDate: projects.targetEndDate,
};

function toBadgeProject(row: { id: string; name: string; color: string; status: string }): BadgeProject {
  return { id: row.id, name: row.name, color: row.color, archived: row.status === "archived" };
}

/** Open (not done) task counts per project; projects without tasks are missing. */
function openTaskCounts(projectIds: string[]) {
  if (projectIds.length === 0) return new Map<string, number>();
  return new Map(
    db
      .select({ projectId: tasks.projectId, open: sql<number>`sum(case when ${tasks.status} = 'open' then 1 else 0 end)` })
      .from(tasks)
      .where(inArray(tasks.projectId, projectIds))
      .groupBy(tasks.projectId)
      .all()
      .map((row) => [row.projectId!, Number(row.open ?? 0)]),
  );
}

/**
 * A predecessor is late when it is still open and either its due date has
 * passed or it ends on/after the day this project is planned to start.
 */
function isLate(dueDate: string | null, today: string, plannedStart: string | null) {
  if (!dueDate) return false;
  return dueDate < today || (plannedStart !== null && dueDate >= plannedStart);
}

export function getDependencyBadges(projectId: string, today: string): DependencyBadges {
  const self = db.select(projectFields).from(projects).where(eq(projects.id, projectId)).get();
  if (!self) return { waitingFor: [], blocks: [] };
  const plannedStart = db.select({ start: projects.plannedStartDate }).from(projects).where(eq(projects.id, projectId)).get()?.start ?? null;
  const ownTasks = db
    .select({ id: tasks.id, title: tasks.title, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .all();
  const ownTaskById = new Map(ownTasks.map((task) => [task.id, task]));
  const ownTaskIds = ownTasks.map((task) => task.id);

  const waitingFor: WaitingForBadge[] = [];

  // Whole-project waits: on another project or on a single task.
  const projectWaits = db.select().from(projectDependencies).where(eq(projectDependencies.successorProjectId, projectId)).all();
  const predecessorProjectIds = projectWaits.filter((row) => row.predecessorType === "project").map((row) => row.predecessorId);
  // Task-level waits: one of this project's tasks waits for another project.
  const taskWaits = ownTaskIds.length === 0
    ? []
    : db.select().from(projectTaskDependencies).where(inArray(projectTaskDependencies.successorTaskId, ownTaskIds)).all();
  const allPredecessorProjectIds = [...new Set([...predecessorProjectIds, ...taskWaits.map((row) => row.predecessorProjectId)])];
  const predecessorProjects = new Map(
    (allPredecessorProjectIds.length === 0
      ? []
      : db.select(projectFields).from(projects).where(inArray(projects.id, allPredecessorProjectIds)).all()
    ).map((row) => [row.id, row]),
  );
  const openCounts = openTaskCounts(allPredecessorProjectIds);
  const projectOpen = (id: string) => {
    const row = predecessorProjects.get(id);
    // A project without any tasks yet is not finished either.
    return Boolean(row && row.status === "active" && (openCounts.get(id) ?? 1) > 0);
  };

  for (const row of projectWaits) {
    if (row.predecessorType === "project") {
      const predecessor = predecessorProjects.get(row.predecessorId);
      if (!predecessor || !projectOpen(predecessor.id)) continue;
      waitingFor.push({
        key: row.id,
        project: toBadgeProject(predecessor),
        task: null,
        via: null,
        dueDate: predecessor.targetEndDate,
        late: isLate(predecessor.targetEndDate, today, plannedStart),
      });
    } else {
      const task = db
        .select({ id: tasks.id, title: tasks.title, status: tasks.status, dueDate: tasks.dueDate, project: projectFields })
        .from(tasks)
        .leftJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.id, row.predecessorId))
        .get();
      if (!task || task.status === "done") continue;
      waitingFor.push({
        key: row.id,
        project: task.project?.id ? toBadgeProject(task.project) : null,
        task: { id: task.id, title: task.title },
        via: null,
        dueDate: task.dueDate,
        late: isLate(task.dueDate, today, plannedStart),
      });
    }
  }

  // Several tasks waiting for the same project collapse into one badge.
  const taskWaitsByProject = new Map<string, string[]>();
  for (const row of taskWaits) {
    const waitingTask = ownTaskById.get(row.successorTaskId);
    if (!waitingTask || waitingTask.status === "done" || !projectOpen(row.predecessorProjectId)) continue;
    if (predecessorProjectIds.includes(row.predecessorProjectId)) continue;
    taskWaitsByProject.set(row.predecessorProjectId, [...(taskWaitsByProject.get(row.predecessorProjectId) ?? []), waitingTask.title]);
  }
  for (const [predecessorId, titles] of taskWaitsByProject) {
    const predecessor = predecessorProjects.get(predecessorId)!;
    waitingFor.push({
      key: `task-wait-${predecessorId}`,
      project: toBadgeProject(predecessor),
      task: null,
      via: titles.length === 1 ? titles[0] : null,
      dueDate: predecessor.targetEndDate,
      late: predecessor.targetEndDate !== null && predecessor.targetEndDate < today,
    });
  }
  waitingFor.sort((a, b) => Number(b.late) - Number(a.late) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));

  // Nothing is held up by a project that has no open work left.
  const selfOpen = self.status === "active" && ownTasks.some((task) => task.status === "open");
  const blocks = new Map<string, BlockingBadge>();
  if (selfOpen || ownTasks.length === 0) {
    const successorRows = [
      ...db
        .select({ projectId: projectDependencies.successorProjectId, predecessorId: projectDependencies.predecessorId, type: projectDependencies.predecessorType })
        .from(projectDependencies)
        .where(and(eq(projectDependencies.predecessorType, "project"), eq(projectDependencies.predecessorId, projectId)))
        .all(),
      ...(ownTaskIds.length === 0
        ? []
        : db
            .select({ projectId: projectDependencies.successorProjectId, predecessorId: projectDependencies.predecessorId, type: projectDependencies.predecessorType })
            .from(projectDependencies)
            .where(and(eq(projectDependencies.predecessorType, "task"), inArray(projectDependencies.predecessorId, ownTaskIds)))
            .all()),
    ];
    const taskSuccessors = db
      .select({ projectId: tasks.projectId })
      .from(projectTaskDependencies)
      .innerJoin(tasks, eq(projectTaskDependencies.successorTaskId, tasks.id))
      .where(and(eq(projectTaskDependencies.predecessorProjectId, projectId), eq(tasks.status, "open")))
      .all();
    const successorIds = [...new Set([...successorRows.map((row) => row.projectId), ...taskSuccessors.map((row) => row.projectId).filter((id): id is string => Boolean(id))])]
      .filter((id) => id !== projectId);
    const successors = new Map(
      (successorIds.length === 0 ? [] : db.select(projectFields).from(projects).where(inArray(projects.id, successorIds)).all()).map((row) => [row.id, row]),
    );
    for (const row of successorRows) {
      const successor = successors.get(row.projectId);
      if (!successor || successor.status !== "active") continue;
      const task = row.type === "task" ? ownTaskById.get(row.predecessorId) : null;
      if (task?.status === "done") continue;
      const existing = blocks.get(successor.id);
      // A whole-project wait wins over a wait for one task.
      if (existing && existing.via === null) continue;
      blocks.set(successor.id, { project: toBadgeProject(successor), via: task?.title ?? null });
    }
    for (const row of taskSuccessors) {
      const successor = row.projectId ? successors.get(row.projectId) : undefined;
      if (!successor || successor.status !== "active" || blocks.has(successor.id)) continue;
      blocks.set(successor.id, { project: toBadgeProject(successor), via: null });
    }
  }

  return { waitingFor, blocks: [...blocks.values()] };
}
