// Compact project summary: task counts, the next due item, logged hours and how
// many records are connected. Used by the project header chips and hover preview.
import { and, asc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { user } from "@/db/core-schema";
import {
  contextLinks,
  fundingProjects,
  personnelFundingProjectLinks,
  projects,
  tasks,
  timeEntries,
} from "@/db/schema";
import { knowledgeTargetTypes, projectLinkTargetTypes } from "@/modules/context/schema";

export type ProjectNextItem = {
  id: string;
  title: string;
  dueDate: string;
  milestone: boolean;
};

export type ProjectTaskSummary = {
  open: number;
  overdue: number;
  done: number;
  next: ProjectNextItem | null;
};

function taskSummary(projectId: string, today: string): ProjectTaskSummary {
  const counts = db
    .select({
      open: sql<number>`sum(case when ${tasks.status} = 'open' then 1 else 0 end)`,
      overdue: sql<number>`sum(case when ${tasks.status} = 'open' and ${tasks.dueDate} < ${today} then 1 else 0 end)`,
      done: sql<number>`sum(case when ${tasks.status} = 'done' then 1 else 0 end)`,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .get();
  // Milestones and deadlines win over ordinary tasks due the same day.
  const next = db
    .select({ id: tasks.id, title: tasks.title, dueDate: tasks.dueDate, isMilestone: tasks.isMilestone, kind: tasks.kind })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "open"), isNotNull(tasks.dueDate), gte(tasks.dueDate, today)))
    .orderBy(asc(tasks.dueDate), sql`${tasks.isMilestone} = 0`, sql`${tasks.kind} = 'task'`, asc(tasks.sortOrder))
    .limit(1)
    .get();
  return {
    open: Number(counts?.open ?? 0),
    overdue: Number(counts?.overdue ?? 0),
    done: Number(counts?.done ?? 0),
    next: next?.dueDate
      ? { id: next.id, title: next.title, dueDate: next.dueDate, milestone: next.isMilestone || next.kind === "deadline" }
      : null,
  };
}

function monthRange(today: string) {
  const [year, month] = today.split("-").map(Number);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    from: `${today.slice(0, 7)}-01`,
    to: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`,
  };
}

/** Finished work minutes this month; `userId` limits it to one person. */
function monthMinutes(projectId: string, today: string, userId?: string) {
  const { from, to } = monthRange(today);
  const row = db
    .select({
      minutes: sql<number>`coalesce(sum(max(0, (${timeEntries.endedAt} - ${timeEntries.startedAt}) / 60000 - ${timeEntries.breakMinutes})), 0)`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.projectId, projectId),
        isNotNull(timeEntries.endedAt),
        gte(timeEntries.workDate, from),
        lt(timeEntries.workDate, to),
        userId ? eq(timeEntries.userId, userId) : undefined,
      ),
    )
    .get();
  return Math.round(Number(row?.minutes ?? 0));
}

function linkCount(projectId: string, targetTypes: readonly string[]) {
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(contextLinks)
    .where(
      and(
        eq(contextLinks.ownerType, "project"),
        eq(contextLinks.ownerId, projectId),
        inArray(contextLinks.targetType, [...targetTypes] as (typeof contextLinks.$inferSelect.targetType)[]),
      ),
    )
    .get();
  return Number(row?.count ?? 0);
}

export type ProjectPulse = ProjectTaskSummary & {
  /** Team total for admins and personnel, otherwise the viewer's own minutes. */
  monthMinutes: number;
  hoursScope: "team" | "own";
  knowledgeCount: number;
  connectionCount: number;
  funding: { id: string; name: string }[];
};

export function getProjectPulse(
  projectId: string,
  today: string,
  viewer: { id: string; role?: string | null },
): ProjectPulse {
  const fullAccess = viewer.role === "admin" || viewer.role === "personnel";
  return {
    ...taskSummary(projectId, today),
    monthMinutes: monthMinutes(projectId, today, fullAccess ? undefined : viewer.id),
    hoursScope: fullAccess ? "team" : "own",
    knowledgeCount: linkCount(projectId, knowledgeTargetTypes),
    connectionCount: linkCount(projectId, projectLinkTargetTypes),
    // Funding links belong to personnel planning, which only these roles see.
    funding: fullAccess
      ? db
          .select({ id: fundingProjects.id, name: fundingProjects.name })
          .from(personnelFundingProjectLinks)
          .innerJoin(fundingProjects, eq(personnelFundingProjectLinks.fundingProjectId, fundingProjects.id))
          .where(eq(personnelFundingProjectLinks.projectId, projectId))
          .orderBy(asc(fundingProjects.name))
          .all()
      : [],
  };
}

export type ProjectPreview = ProjectTaskSummary & {
  id: string;
  name: string;
  color: string;
  archived: boolean;
  description: string;
  managerName: string | null;
  targetEndDate: string | null;
};

/** What the hover card shows about a project. */
export function getProjectPreview(projectId: string, today: string): ProjectPreview | null {
  const project = db
    .select({
      id: projects.id,
      name: projects.name,
      color: projects.color,
      status: projects.status,
      description: projects.description,
      targetEndDate: projects.targetEndDate,
      managerName: user.name,
    })
    .from(projects)
    .leftJoin(user, eq(projects.managerId, user.id))
    .where(eq(projects.id, projectId))
    .get();
  if (!project) return null;
  return {
    id: project.id,
    name: project.name,
    color: project.color,
    archived: project.status === "archived",
    description: project.description,
    managerName: project.managerName ?? null,
    targetEndDate: project.targetEndDate,
    ...taskSummary(projectId, today),
  };
}
