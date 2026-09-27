import "server-only";

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { visibleContactCondition, type NetworkViewer } from "./access";
import { isLeadActive, normalizeText } from "./network-utils";
import { listNetworkContactOptions, toLeadViews, type NetworkLeadView } from "./queries";
import { networkContacts, networkLeads, networkOrganizations } from "./schema";

/**
 * Which organisations a viewer may see, with what makes them relevant: an
 * organisation shows up through a visible contact working there, a visible
 * lead that could introduce us to it, or because the viewer created it.
 */
function organizationSignals(viewer: NetworkViewer) {
  const people = db
    .select({ organizationId: networkContacts.organizationId })
    .from(networkContacts)
    .where(and(visibleContactCondition(viewer.id), isNotNull(networkContacts.organizationId)))
    .all();
  const leads = db
    .select({ organizationId: networkLeads.targetOrganizationId, status: networkLeads.status })
    .from(networkLeads)
    .innerJoin(networkContacts, eq(networkContacts.id, networkLeads.contactId))
    .where(and(visibleContactCondition(viewer.id), isNotNull(networkLeads.targetOrganizationId)))
    .all();
  const counts = new Map<string, { people: number; intros: number }>();
  const entry = (id: string) => counts.get(id) ?? counts.set(id, { people: 0, intros: 0 }).get(id)!;
  for (const row of people) entry(row.organizationId!).people += 1;
  for (const row of leads) {
    // Closed leads still make the organisation visible, but only active ones count as intros.
    const signal = entry(row.organizationId!);
    if (isLeadActive(row.status)) signal.intros += 1;
  }
  return counts;
}

export type NetworkOrganizationListItem = {
  id: string;
  name: string;
  website: string;
  people: number;
  intros: number;
};

export function listNetworkOrganizations(viewer: NetworkViewer): NetworkOrganizationListItem[] {
  const counts = organizationSignals(viewer);
  const rows = db.select().from(networkOrganizations).orderBy(asc(networkOrganizations.normalizedName)).all();
  return rows
    .filter((organization) => counts.has(organization.id) || organization.createdBy === viewer.id)
    .map((organization) => ({
      id: organization.id,
      name: organization.name,
      website: organization.website,
      ...(counts.get(organization.id) ?? { people: 0, intros: 0 }),
    }))
    .sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name), "de"));
}

export function listNetworkOrganizationNames(viewer: NetworkViewer) {
  return listNetworkOrganizations(viewer).map((organization) => organization.name);
}

export function canViewOrganization(viewer: NetworkViewer, organization: { id: string; createdBy: string }) {
  return organization.createdBy === viewer.id || organizationSignals(viewer).has(organization.id);
}

export type NetworkOrganizationDetail = typeof networkOrganizations.$inferSelect & {
  people: { id: string; name: string; role: string; visibility: "private" | "team" }[];
  /** Visible leads that could introduce us to this organisation. */
  introductions: NetworkLeadView[];
};

export function getNetworkOrganization(viewer: NetworkViewer, id: string): NetworkOrganizationDetail | null {
  const organization = db.select().from(networkOrganizations).where(eq(networkOrganizations.id, id)).get();
  if (!organization || !canViewOrganization(viewer, organization)) return null;
  const people = db
    .select({ id: networkContacts.id, name: networkContacts.name, role: networkContacts.role, visibility: networkContacts.visibility })
    .from(networkContacts)
    .where(and(eq(networkContacts.organizationId, id), visibleContactCondition(viewer.id)))
    .orderBy(asc(networkContacts.name))
    .all();
  const contacts = listNetworkContactOptions(viewer);
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const leads = contacts.length
    ? db
        .select()
        .from(networkLeads)
        .where(and(
          eq(networkLeads.targetOrganizationId, id),
          inArray(networkLeads.contactId, contacts.map((contact) => contact.id)),
        ))
        .all()
    : [];
  return { ...organization, people, introductions: toLeadViews(leads, contactsById) };
}
