// The project's activity feed, derived from timestamps the app already keeps:
// tasks created and finished, time logged, links added, schedule changes and
// paid invoices. Used by the project page's activity view.
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  contextLinks,
  invoices,
  projectScheduleChangeItems,
  scheduleChangeItems,
  scheduleChangeSets,
  tasks,
  timeEntries,
} from "@/db/schema";
import { safeInternalRoute } from "@/lib/internal-route";
import { canonicalTaskHref } from "@/modules/context/routes";
import { visibleLinkedEvents } from "@/modules/context/project-links";
import type { ContextTargetType } from "@/modules/context/schema";

export type ActivityKind =
  | "taskCreated"
  | "taskDone"
  | "time"
  | "linked"
  | "schedule"
  | "invoicePaid";

export type ActivityItem = {
  id: string;
  kind: ActivityKind;
  /** Milliseconds since the epoch. */
  at: number;
  actorId: string | null;
  title: string;
  href: string | null;
  targetType?: ContextTargetType;
  minutes?: number;
  count?: number;
  reverted?: boolean;
};

export const ACTIVITY_PAGE_SIZE = 50;
export const ACTIVITY_MAX = 500;

function taskItems(projectId: string, limit: number): ActivityItem[] {
  const created = db
    .select({ id: tasks.id, title: tasks.title, createdBy: tasks.createdBy, createdAt: tasks.createdAt })
    .from(tasks)
    .where(eq(tasks.projectId, projectId))
    .orderBy(desc(tasks.createdAt))
    .limit(limit)
    .all()
    .map((task): ActivityItem => ({
      id: `created-${task.id}`,
      kind: "taskCreated",
      at: task.createdAt.getTime(),
      actorId: task.createdBy,
      title: task.title,
      href: canonicalTaskHref(task.id, projectId),
    }));
  // Who ticked a task off is not recorded, so completions carry no actor.
  const done = db
    .select({ id: tasks.id, title: tasks.title, completedAt: tasks.completedAt })
    .from(tasks)
    .where(and(eq(tasks.projectId, projectId), eq(tasks.status, "done"), isNotNull(tasks.completedAt)))
    .orderBy(desc(tasks.completedAt))
    .limit(limit)
    .all()
    .map((task): ActivityItem => ({
      id: `done-${task.id}`,
      kind: "taskDone",
      at: task.completedAt!.getTime(),
      actorId: null,
      title: task.title,
      href: canonicalTaskHref(task.id, projectId),
    }));
  return [...created, ...done];
}

/** One item per person and work day; others' hours only for full access. */
function timeItems(projectId: string, viewer: { id: string; fullAccess: boolean }, limit: number): ActivityItem[] {
  const lastEnd = sql<number>`max(${timeEntries.endedAt})`;
  return db
    .select({
      userId: timeEntries.userId,
      workDate: timeEntries.workDate,
      minutes: sql<number>`sum(max(0, (${timeEntries.endedAt} - ${timeEntries.startedAt}) / 60000 - ${timeEntries.breakMinutes}))`,
      lastEnd,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.projectId, projectId),
        isNotNull(timeEntries.endedAt),
        viewer.fullAccess ? undefined : eq(timeEntries.userId, viewer.id),
      ),
    )
    .groupBy(timeEntries.userId, timeEntries.workDate)
    .orderBy(desc(lastEnd))
    .limit(limit)
    .all()
    .map((row) => ({
      id: `time-${row.userId}-${row.workDate}`,
      kind: "time" as const,
      at: Number(row.lastEnd),
      actorId: row.userId,
      title: row.workDate,
      href: null,
      minutes: Math.round(Number(row.minutes)),
    }));
}

function internalHref(route: string) {
  try {
    return safeInternalRoute(route);
  } catch {
    return null;
  }
}

function linkItems(projectId: string, viewerId: string, limit: number): ActivityItem[] {
  const links = db
    .select()
    .from(contextLinks)
    .where(and(eq(contextLinks.ownerType, "project"), eq(contextLinks.ownerId, projectId)))
    .orderBy(desc(contextLinks.createdAt))
    .limit(limit)
    .all();
  const visibleEventIds = new Set(
    visibleLinkedEvents(
      links.filter((link) => link.targetType === "calendarEvent").map((link) => link.targetId),
      viewerId,
    ).map((event) => event.id),
  );
  return links.flatMap((link): ActivityItem[] => {
    if (link.targetType === "calendarEvent" && !visibleEventIds.has(link.targetId)) return [];
    return [{
      id: `link-${link.id}`,
      kind: "linked",
      at: link.createdAt.getTime(),
      actorId: link.createdBy,
      title: link.label || link.route,
      href: internalHref(link.route),
      targetType: link.targetType,
    }];
  });
}

/** Schedule change sets touching the project or one of its tasks. */
function scheduleItems(projectId: string, limit: number): ActivityItem[] {
  const count = sql<number>`count(*)`;
  const viaTasks = db
    .select({ id: scheduleChangeSets.id, count })
    .from(scheduleChangeSets)
    .innerJoin(scheduleChangeItems, eq(scheduleChangeItems.changeSetId, scheduleChangeSets.id))
    .innerJoin(tasks, eq(scheduleChangeItems.taskId, tasks.id))
    .where(eq(tasks.projectId, projectId))
    .groupBy(scheduleChangeSets.id)
    .orderBy(desc(scheduleChangeSets.createdAt))
    .limit(limit)
    .all();
  const viaProject = db
    .select({ id: scheduleChangeSets.id, count })
    .from(scheduleChangeSets)
    .innerJoin(projectScheduleChangeItems, eq(projectScheduleChangeItems.changeSetId, scheduleChangeSets.id))
    .where(eq(projectScheduleChangeItems.projectId, projectId))
    .groupBy(scheduleChangeSets.id)
    .orderBy(desc(scheduleChangeSets.createdAt))
    .limit(limit)
    .all();
  const counts = new Map<string, number>();
  for (const row of [...viaTasks, ...viaProject]) counts.set(row.id, (counts.get(row.id) ?? 0) + Number(row.count));
  if (counts.size === 0) return [];
  return db
    .select()
    .from(scheduleChangeSets)
    .where(inArray(scheduleChangeSets.id, [...counts.keys()]))
    .all()
    .map((set) => ({
      id: `schedule-${set.id}`,
      kind: "schedule" as const,
      at: set.createdAt.getTime(),
      actorId: set.createdBy,
      title: "",
      href: `/projects/${encodeURIComponent(projectId)}`,
      count: counts.get(set.id),
      reverted: set.status === "reverted",
    }));
}

function invoiceItems(projectId: string, limit: number): ActivityItem[] {
  return db
    .select({ id: invoices.id, number: invoices.invoiceNumber, paidAt: invoices.paidAt })
    .from(contextLinks)
    .innerJoin(invoices, eq(contextLinks.targetId, invoices.id))
    .where(
      and(
        eq(contextLinks.ownerType, "project"),
        eq(contextLinks.ownerId, projectId),
        eq(contextLinks.targetType, "invoice"),
        isNotNull(invoices.paidAt),
      ),
    )
    .orderBy(desc(invoices.paidAt))
    .limit(limit)
    .all()
    .map((row) => ({
      id: `paid-${row.id}`,
      kind: "invoicePaid" as const,
      at: row.paidAt!.getTime(),
      actorId: null,
      title: row.number,
      href: `/accounting/invoices/${row.id}`,
    }));
}

/** Newest first. Each source fetches `limit + 1` rows so `hasMore` is exact. */
export function listProjectActivity(
  projectId: string,
  viewer: { id: string; role?: string | null },
  limit = ACTIVITY_PAGE_SIZE,
) {
  const size = Math.min(Math.max(1, limit), ACTIVITY_MAX);
  const fullAccess = viewer.role === "admin" || viewer.role === "personnel";
  const all = [
    ...taskItems(projectId, size + 1),
    ...timeItems(projectId, { id: viewer.id, fullAccess }, size + 1),
    ...linkItems(projectId, viewer.id, size + 1),
    ...scheduleItems(projectId, size + 1),
    ...invoiceItems(projectId, size + 1),
  ].sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  return { items: all.slice(0, size), hasMore: all.length > size };
}
