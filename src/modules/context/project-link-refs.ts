// Project tags on records from other modules (calendar events, invoices, bookings,
// customers), stored as `context_links` rows owned by the project: reading and
// writing the tags. Used by project-link-actions.ts, the calendar and accounting.
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  calendarEvents,
  contextLinks,
  customers,
  entries,
  invoices,
  projects,
} from "@/db/schema";
import type { ProjectLinkTargetType } from "./schema";

type Db = typeof db;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Executor = Db | Tx;

export type ProjectRefDto = {
  id: string;
  name: string;
  color: string;
  archived: boolean;
};

const projectRef = {
  id: projects.id,
  name: projects.name,
  color: projects.color,
  status: projects.status,
};

function toRef(row: { id: string; name: string; color: string; status: string }): ProjectRefDto {
  return { id: row.id, name: row.name, color: row.color, archived: row.status === "archived" };
}

/** Active projects first, in the portfolio's order. */
export function listProjectRefs(): ProjectRefDto[] {
  return db
    .select(projectRef)
    .from(projects)
    .orderBy(asc(projects.status), asc(projects.sortOrder), asc(projects.name))
    .all()
    .map(toRef);
}

/** Linked projects per target id, for list views that show tags on every row. */
export function linkedProjectsFor(
  targetType: ProjectLinkTargetType,
  targetIds: string[],
  executor: Executor = db,
) {
  const result = new Map<string, ProjectRefDto[]>();
  if (targetIds.length === 0) return result;
  const rows = executor
    .select({ targetId: contextLinks.targetId, ...projectRef })
    .from(contextLinks)
    .innerJoin(projects, eq(contextLinks.ownerId, projects.id))
    .where(
      and(
        eq(contextLinks.ownerType, "project"),
        eq(contextLinks.targetType, targetType),
        inArray(contextLinks.targetId, [...new Set(targetIds)]),
      ),
    )
    .orderBy(asc(projects.sortOrder), asc(projects.name))
    .all();
  for (const row of rows) {
    const list = result.get(row.targetId) ?? [];
    list.push(toRef(row));
    result.set(row.targetId, list);
  }
  return result;
}

export function linkedProjects(targetType: ProjectLinkTargetType, targetId: string) {
  return linkedProjectsFor(targetType, [targetId]).get(targetId) ?? [];
}

function targetRoute(targetType: ProjectLinkTargetType, targetId: string) {
  if (targetType === "invoice") return `/accounting/invoices/${encodeURIComponent(targetId)}`;
  if (targetType === "accountingEntry") return "/accounting/bookings";
  if (targetType === "customer") return "/accounting/customers";
  return "/calendar";
}

/** Title of the target, or null when it does not exist. */
export function projectLinkTargetLabel(targetType: ProjectLinkTargetType, targetId: string, executor: Executor = db) {
  if (targetType === "calendarEvent") {
    return executor.select({ label: calendarEvents.title }).from(calendarEvents).where(eq(calendarEvents.id, targetId)).get()?.label ?? null;
  }
  if (targetType === "invoice") {
    return executor.select({ label: invoices.invoiceNumber }).from(invoices).where(eq(invoices.id, targetId)).get()?.label ?? null;
  }
  if (targetType === "accountingEntry") {
    return executor.select({ label: entries.description }).from(entries).where(eq(entries.id, targetId)).get()?.label ?? null;
  }
  return executor.select({ label: customers.name }).from(customers).where(eq(customers.id, targetId)).get()?.label ?? null;
}

/**
 * Makes the target's project tags exactly `projectIds`. Unknown project ids are
 * ignored; call inside the transaction that saves the target when there is one.
 */
export function syncProjectLinks(
  executor: Executor,
  input: {
    targetType: ProjectLinkTargetType;
    targetId: string;
    projectIds: string[];
    userId: string;
    label?: string;
  },
) {
  const wanted = input.projectIds.length === 0
    ? []
    : executor
        .select({ id: projects.id })
        .from(projects)
        .where(inArray(projects.id, [...new Set(input.projectIds)]))
        .all()
        .map((row) => row.id);
  const existing = executor
    .select({ id: contextLinks.id, ownerId: contextLinks.ownerId })
    .from(contextLinks)
    .where(
      and(
        eq(contextLinks.ownerType, "project"),
        eq(contextLinks.targetType, input.targetType),
        eq(contextLinks.targetId, input.targetId),
      ),
    )
    .all();
  const stale = existing.filter((link) => !wanted.includes(link.ownerId)).map((link) => link.id);
  if (stale.length > 0) executor.delete(contextLinks).where(inArray(contextLinks.id, stale)).run();
  const missing = wanted.filter((id) => !existing.some((link) => link.ownerId === id));
  if (missing.length === 0) return;
  const label = input.label ?? projectLinkTargetLabel(input.targetType, input.targetId, executor) ?? "";
  executor
    .insert(contextLinks)
    .values(
      missing.map((projectId) => ({
        ownerType: "project" as const,
        ownerId: projectId,
        targetType: input.targetType,
        targetId: input.targetId,
        relation: "related" as const,
        route: targetRoute(input.targetType, input.targetId),
        label: label.slice(0, 300),
        createdBy: input.userId,
      })),
    )
    .onConflictDoNothing()
    .run();
}
