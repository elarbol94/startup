// Everything tagged with one project, as listed on the project's knowledge view.
// The tags themselves are read and written in project-link-refs.ts.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  calendarEvents,
  calendars,
  contextLinks,
  customers,
  entries,
  invoices,
} from "@/db/schema";
import { calendarRoleForUser } from "@/modules/calendar/queries";
import { localDateInZone } from "@/modules/calendar/date-utils";
import type { ProjectLinkTargetType } from "./schema";

export type ProjectConnectionItem = {
  id: string;
  title: string;
  href: string;
  date: string | null;
  /** Integer cents for bookings, so the page formats them in the viewer's locale. */
  amountCents?: number;
  kind?: "income" | "expense";
  status?: string;
  detail?: string;
};

export type ProjectConnections = {
  events: ProjectConnectionItem[];
  invoices: ProjectConnectionItem[];
  entries: ProjectConnectionItem[];
  customers: ProjectConnectionItem[];
};

function linkedTargetIds(projectId: string, targetType: ProjectLinkTargetType) {
  return db
    .select({ targetId: contextLinks.targetId })
    .from(contextLinks)
    .where(
      and(
        eq(contextLinks.ownerType, "project"),
        eq(contextLinks.ownerId, projectId),
        eq(contextLinks.targetType, targetType),
      ),
    )
    .all()
    .map((row) => row.targetId);
}

/** Calendar events stay hidden unless the viewer may read their details. */
function visibleEvents(projectId: string, viewerId: string, today: string): ProjectConnectionItem[] {
  const ids = linkedTargetIds(projectId, "calendarEvent");
  if (ids.length === 0) return [];
  const rows = db
    .select({ event: calendarEvents, visibility: calendars.visibility })
    .from(calendarEvents)
    .innerJoin(calendars, eq(calendarEvents.calendarId, calendars.id))
    .where(and(inArray(calendarEvents.id, ids), eq(calendarEvents.status, "confirmed")))
    .all();
  const roles = new Map<string, ReturnType<typeof calendarRoleForUser>>();
  const items = rows.flatMap(({ event, visibility }) => {
    if (!roles.has(event.calendarId)) roles.set(event.calendarId, calendarRoleForUser(event.calendarId, viewerId));
    const role = roles.get(event.calendarId);
    // Viewers of a "busy" calendar only see that time is taken, as in the calendar.
    if (!role || (visibility === "busy" && role === "viewer")) return [];
    const date = event.allDay ? event.startDate : event.startAt ? localDateInZone(event.startAt, event.timezone) : null;
    return [{
      id: event.id,
      title: event.title,
      href: `/calendar?view=week${date ? `&date=${date}` : ""}`,
      date,
      detail: event.recurrenceRule ? "recurring" : undefined,
    }];
  });
  // Upcoming first (soonest on top), then the past (most recent on top).
  const upcoming = items.filter((item) => (item.date ?? "") >= today).sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  const past = items.filter((item) => (item.date ?? "") < today).sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  return [...upcoming, ...past];
}

export function listProjectConnections(projectId: string, viewerId: string, today: string): ProjectConnections {
  const invoiceIds = linkedTargetIds(projectId, "invoice");
  const entryIds = linkedTargetIds(projectId, "accountingEntry");
  const customerIds = linkedTargetIds(projectId, "customer");
  return {
    events: visibleEvents(projectId, viewerId, today),
    invoices: invoiceIds.length === 0 ? [] : db
      .select({
        id: invoices.id,
        number: invoices.invoiceNumber,
        issueDate: invoices.issueDate,
        status: invoices.status,
        customer: customers.name,
      })
      .from(invoices)
      .leftJoin(customers, eq(invoices.customerId, customers.id))
      .where(inArray(invoices.id, invoiceIds))
      .orderBy(desc(invoices.issueDate))
      .all()
      .map((row) => ({
        id: row.id,
        title: row.number,
        href: `/accounting/invoices/${row.id}`,
        date: row.issueDate,
        status: row.status,
        detail: row.customer ?? undefined,
      })),
    entries: entryIds.length === 0 ? [] : db
      .select({
        id: entries.id,
        description: entries.description,
        date: entries.date,
        status: entries.status,
        kind: entries.kind,
        gross: entries.grossAmountCents,
      })
      .from(entries)
      .where(inArray(entries.id, entryIds))
      .orderBy(desc(entries.date))
      .all()
      .map((row) => ({
        id: row.id,
        title: row.description,
        href: `/accounting/bookings?year=${row.date.slice(0, 4)}&month=${Number(row.date.slice(5, 7))}`,
        date: row.date,
        status: row.status,
        kind: row.kind,
        amountCents: row.gross,
      })),
    customers: customerIds.length === 0 ? [] : db
      .select({ id: customers.id, name: customers.name, email: customers.email })
      .from(customers)
      .where(inArray(customers.id, customerIds))
      .orderBy(asc(customers.name))
      .all()
      .map((row) => ({
        id: row.id,
        title: row.name,
        href: "/accounting/customers",
        date: null,
        detail: row.email || undefined,
      })),
  };
}
