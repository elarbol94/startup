import "server-only";

import { and, asc, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import { db } from "@/db";
import { fundingProjects, projects, wikiPages } from "@/db/schema";
import { canonicalEntityHref } from "@/modules/context/routes";
import { visibleContactCondition, type NetworkViewer } from "./access";
import type { ContactLinkTargetType } from "./constants";
import { isLeadActive } from "./network-utils";
import { networkContactLinks, networkContacts, networkLeads } from "./schema";

export type NetworkLinkTarget = { type: ContactLinkTargetType; id: string; title: string; subtitle: string; href: string };

const fundingHref = (id: string) => `/accounting/funding-projects/${encodeURIComponent(id)}`;

/** Resolves link targets to titles and routes; deleted targets are simply missing. */
function resolveTargets(refs: { type: ContactLinkTargetType; id: string }[]) {
  const idsOf = (type: ContactLinkTargetType) => [...new Set(refs.filter((ref) => ref.type === type).map((ref) => ref.id))];
  const result = new Map<string, NetworkLinkTarget>();
  const key = (type: ContactLinkTargetType, id: string) => `${type}:${id}`;
  const projectIds = idsOf("project");
  if (projectIds.length) {
    for (const row of db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, projectIds)).all()) {
      result.set(key("project", row.id), { type: "project", id: row.id, title: row.name, subtitle: "", href: canonicalEntityHref("project", row.id) });
    }
  }
  const fundingIds = idsOf("fundingProject");
  if (fundingIds.length) {
    for (const row of db.select({ id: fundingProjects.id, name: fundingProjects.name, fundingBody: fundingProjects.fundingBody }).from(fundingProjects).where(inArray(fundingProjects.id, fundingIds)).all()) {
      result.set(key("fundingProject", row.id), { type: "fundingProject", id: row.id, title: row.name, subtitle: row.fundingBody, href: fundingHref(row.id) });
    }
  }
  const pageIds = idsOf("wikiPage");
  if (pageIds.length) {
    for (const row of db.select({ id: wikiPages.id, title: wikiPages.title, slug: wikiPages.slug }).from(wikiPages).where(and(inArray(wikiPages.id, pageIds), isNull(wikiPages.deletedAt))).all()) {
      result.set(key("wikiPage", row.id), { type: "wikiPage", id: row.id, title: row.title, subtitle: "", href: canonicalEntityHref("wikiPage", row.id, { slug: row.slug }) });
    }
  }
  return (type: ContactLinkTargetType, id: string) => result.get(key(type, id));
}

export function targetExists(type: ContactLinkTargetType, id: string) {
  return Boolean(resolveTargets([{ type, id }])(type, id));
}

export type NetworkContactLink = NetworkLinkTarget & { linkId: string };

/** The records a contact is linked to, in the order they were linked. */
export function listContactLinks(contactId: string): NetworkContactLink[] {
  const rows = db
    .select()
    .from(networkContactLinks)
    .where(eq(networkContactLinks.contactId, contactId))
    .orderBy(asc(networkContactLinks.createdAt))
    .all();
  const resolve = resolveTargets(rows.map((row) => ({ type: row.targetType, id: row.targetId })));
  return rows.flatMap((row) => {
    const target = resolve(row.targetType, row.targetId);
    return target ? [{ ...target, linkId: row.id }] : [];
  });
}

export type LinkedNetworkContact = {
  linkId: string;
  contactId: string;
  name: string;
  role: string;
  organization: string;
  visibility: "private" | "team";
  activeLeads: number;
};

/** Contacts linked to a project, funding project or wiki page that the viewer may see. */
export function listLinkedNetworkContacts(viewer: NetworkViewer, type: ContactLinkTargetType, targetId: string): LinkedNetworkContact[] {
  const rows = db
    .select({
      linkId: networkContactLinks.id,
      contactId: networkContacts.id,
      name: networkContacts.name,
      role: networkContacts.role,
      organization: networkContacts.organization,
      visibility: networkContacts.visibility,
    })
    .from(networkContactLinks)
    .innerJoin(networkContacts, eq(networkContacts.id, networkContactLinks.contactId))
    .where(and(eq(networkContactLinks.targetType, type), eq(networkContactLinks.targetId, targetId), visibleContactCondition(viewer.id)))
    .orderBy(asc(networkContacts.name))
    .all();
  if (!rows.length) return [];
  const leads = db
    .select({ contactId: networkLeads.contactId, status: networkLeads.status })
    .from(networkLeads)
    .where(inArray(networkLeads.contactId, rows.map((row) => row.contactId)))
    .all();
  return rows.map((row) => ({
    ...row,
    activeLeads: leads.filter((lead) => lead.contactId === row.contactId && isLeadActive(lead.status)).length,
  }));
}

/** Candidates for the link picker: projects, funding projects and wiki pages matching the query. */
export function searchLinkTargets(query: string, limit = 6): NetworkLinkTarget[] {
  const trimmed = query.trim();
  const pattern = `%${trimmed}%`;
  const projectRows = db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(trimmed ? like(projects.name, pattern) : eq(projects.status, "active"))
    .orderBy(desc(projects.updatedAt))
    .limit(limit)
    .all();
  const fundingRows = db
    .select({ id: fundingProjects.id, name: fundingProjects.name, fundingBody: fundingProjects.fundingBody })
    .from(fundingProjects)
    .where(trimmed ? or(like(fundingProjects.name, pattern), like(fundingProjects.fundingBody, pattern), like(fundingProjects.programName, pattern)) : undefined)
    .orderBy(desc(fundingProjects.updatedAt))
    .limit(limit)
    .all();
  const pageRows = db
    .select({ id: wikiPages.id, title: wikiPages.title, slug: wikiPages.slug })
    .from(wikiPages)
    .where(trimmed ? and(isNull(wikiPages.deletedAt), like(wikiPages.title, pattern)) : isNull(wikiPages.deletedAt))
    .orderBy(desc(wikiPages.updatedAt))
    .limit(limit)
    .all();
  return [
    ...projectRows.map((row) => ({ type: "project" as const, id: row.id, title: row.name, subtitle: "", href: canonicalEntityHref("project", row.id) })),
    ...fundingRows.map((row) => ({ type: "fundingProject" as const, id: row.id, title: row.name, subtitle: row.fundingBody, href: fundingHref(row.id) })),
    ...pageRows.map((row) => ({ type: "wikiPage" as const, id: row.id, title: row.title, subtitle: "", href: canonicalEntityHref("wikiPage", row.id, { slug: row.slug }) })),
  ];
}
