import "server-only";

import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { canEditContact, canManageContact, visibleContactCondition, type NetworkViewer } from "./access";
import type { LeadStatus } from "./constants";
import { listContactLinks, type NetworkContactLink } from "./link-queries";
import { compareLeads, isLeadActive, matchesSearch, normalizeText } from "./network-utils";
import { networkContacts, networkContactTags, networkInteractions, networkLeads, networkTags } from "./schema";

export type NetworkTag = { id: string; name: string };
export type NetworkContactOption = { id: string; name: string; organization: string; visibility: "private" | "team" };

function tagsByContact(contactIds: string[]) {
  const map = new Map<string, NetworkTag[]>();
  if (!contactIds.length) return map;
  const rows = db
    .select({ contactId: networkContactTags.contactId, id: networkTags.id, name: networkTags.name })
    .from(networkContactTags)
    .innerJoin(networkTags, eq(networkTags.id, networkContactTags.tagId))
    .where(inArray(networkContactTags.contactId, contactIds))
    .orderBy(asc(networkTags.normalizedName))
    .all();
  for (const { contactId, ...tag } of rows) map.set(contactId, [...(map.get(contactId) ?? []), tag]);
  return map;
}

function leadsByContact(contactIds: string[]) {
  const map = new Map<string, (typeof networkLeads.$inferSelect)[]>();
  if (!contactIds.length) return map;
  const rows = db.select().from(networkLeads).where(inArray(networkLeads.contactId, contactIds)).all();
  for (const lead of rows.sort(compareLeads)) map.set(lead.contactId, [...(map.get(lead.contactId) ?? []), lead]);
  return map;
}

function visibleContacts(viewer: NetworkViewer) {
  return db
    .select()
    .from(networkContacts)
    .where(visibleContactCondition(viewer.id))
    .orderBy(asc(networkContacts.name))
    .all();
}

/** Name options for autocomplete and for picking an introduced contact. */
export function listNetworkContactOptions(viewer: NetworkViewer): NetworkContactOption[] {
  return db
    .select({
      id: networkContacts.id,
      name: networkContacts.name,
      organization: networkContacts.organization,
      visibility: networkContacts.visibility,
    })
    .from(networkContacts)
    .where(visibleContactCondition(viewer.id))
    .orderBy(asc(networkContacts.name))
    .all();
}

export type NetworkContactListItem = {
  id: string;
  name: string;
  organization: string;
  role: string;
  visibility: "private" | "team";
  isOwn: boolean;
  lastContactOn: string | null;
  tags: NetworkTag[];
  /** Summaries of the leads that still need something, soonest first. */
  activeLeads: { id: string; summary: string; kind: string }[];
};

/**
 * "My network": every visible contact, optionally narrowed by a search over
 * the person, their notes and their leads, and by a tag. The network is small
 * (hundreds of rows), so filtering happens here, which also gives
 * accent-insensitive matching that SQLite's LIKE cannot.
 */
export function listNetworkContacts(viewer: NetworkViewer, filter: { query?: string; tagId?: string } = {}) {
  const contacts = visibleContacts(viewer);
  const ids = contacts.map((contact) => contact.id);
  const tags = tagsByContact(ids);
  const leads = leadsByContact(ids);
  const allTags = new Map<string, NetworkTag & { count: number }>();
  for (const contactTags of tags.values()) {
    for (const tag of contactTags) {
      const entry = allTags.get(tag.id) ?? { ...tag, count: 0 };
      entry.count += 1;
      allTags.set(tag.id, entry);
    }
  }

  const items: NetworkContactListItem[] = [];
  for (const contact of contacts) {
    const contactTags = tags.get(contact.id) ?? [];
    const contactLeads = leads.get(contact.id) ?? [];
    if (filter.tagId && !contactTags.some((tag) => tag.id === filter.tagId)) continue;
    if (filter.query && !matchesSearch(filter.query, [
      contact.name, contact.organization, contact.role, contact.metContext, contact.notes,
      ...contactTags.map((tag) => tag.name),
      ...contactLeads.flatMap((lead) => [lead.summary, lead.targetName, lead.targetOrganization, lead.nextStep]),
    ])) continue;
    items.push({
      id: contact.id,
      name: contact.name,
      organization: contact.organization,
      role: contact.role,
      visibility: contact.visibility,
      isOwn: contact.ownerId === viewer.id,
      lastContactOn: contact.lastContactOn,
      tags: contactTags,
      activeLeads: contactLeads
        .filter((lead) => isLeadActive(lead.status))
        .map((lead) => ({ id: lead.id, summary: lead.summary, kind: lead.kind })),
    });
  }
  return {
    contacts: items,
    total: contacts.length,
    tags: [...allTags.values()].sort((a, b) => normalizeText(a.name).localeCompare(normalizeText(b.name), "de")),
  };
}

export type NetworkLeadView = {
  id: string;
  contactId: string;
  contactName: string;
  /** Private contacts stay out of anything the team sees, such as task origins. */
  contactVisibility: "private" | "team";
  kind: typeof networkLeads.$inferSelect.kind;
  summary: string;
  targetName: string;
  targetOrganization: string;
  targetOrganizationId: string | null;
  /** Only set when the introduced contact is visible to the viewer. */
  targetContact: NetworkContactOption | null;
  status: LeadStatus;
  nextStep: string;
  dueOn: string | null;
  /** The task made from this lead's next step, if any. */
  task: { id: string; title: string; status: "open" | "done"; projectId: string | null } | null;
  createdAt: Date;
};

function linkedTasks(rows: { taskId: string | null }[]) {
  const ids = [...new Set(rows.flatMap((row) => (row.taskId ? [row.taskId] : [])))];
  if (!ids.length) return new Map<string, NonNullable<NetworkLeadView["task"]>>();
  return new Map(
    db
      .select({ id: tasks.id, title: tasks.title, status: tasks.status, projectId: tasks.projectId })
      .from(tasks)
      .where(inArray(tasks.id, ids))
      .all()
      .map((task) => [task.id, task]),
  );
}

export function toLeadViews(
  rows: (typeof networkLeads.$inferSelect)[],
  contactsById: Map<string, NetworkContactOption>,
): NetworkLeadView[] {
  const tasksById = linkedTasks(rows);
  return rows.sort(compareLeads).map((lead) => ({
    id: lead.id,
    contactId: lead.contactId,
    contactName: contactsById.get(lead.contactId)?.name ?? "",
    contactVisibility: contactsById.get(lead.contactId)?.visibility ?? "private",
    kind: lead.kind,
    summary: lead.summary,
    targetName: lead.targetName,
    targetOrganization: lead.targetOrganization,
    targetOrganizationId: lead.targetOrganizationId,
    targetContact: lead.targetContactId ? contactsById.get(lead.targetContactId) ?? null : null,
    status: lead.status,
    nextStep: lead.nextStep,
    dueOn: lead.dueOn,
    task: lead.taskId ? tasksById.get(lead.taskId) ?? null : null,
    createdAt: lead.createdAt,
  }));
}

/** "Open opportunities": leads of visible contacts, active ones by due date. */
export function listNetworkLeads(viewer: NetworkViewer, options: { includeClosed?: boolean } = {}) {
  const contacts = listNetworkContactOptions(viewer);
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  if (!contacts.length) return [];
  const rows = db
    .select()
    .from(networkLeads)
    .where(and(
      inArray(networkLeads.contactId, contacts.map((contact) => contact.id)),
      options.includeClosed ? undefined : inArray(networkLeads.status, ["open", "asked"]),
    ))
    .all();
  return toLeadViews(rows, contactsById);
}

export type NetworkContactDetail = typeof networkContacts.$inferSelect & {
  isOwn: boolean;
  canEdit: boolean;
  canManage: boolean;
  tags: NetworkTag[];
  leads: NetworkLeadView[];
  /** Leads on other contacts that point at this one: "introduced by". */
  introducedBy: NetworkLeadView[];
  interactions: (typeof networkInteractions.$inferSelect)[];
  links: NetworkContactLink[];
};

export function getNetworkContact(viewer: NetworkViewer, id: string): NetworkContactDetail | null {
  const contact = db
    .select()
    .from(networkContacts)
    .where(and(eq(networkContacts.id, id), visibleContactCondition(viewer.id)))
    .get();
  if (!contact) return null;
  const options = listNetworkContactOptions(viewer);
  const contactsById = new Map(options.map((option) => [option.id, option]));
  const leads = db.select().from(networkLeads).where(eq(networkLeads.contactId, id)).all();
  const introductions = db
    .select()
    .from(networkLeads)
    .where(eq(networkLeads.targetContactId, id))
    .all()
    .filter((lead) => contactsById.has(lead.contactId));
  return {
    ...contact,
    isOwn: contact.ownerId === viewer.id,
    canEdit: canEditContact(contact, viewer),
    canManage: canManageContact(contact, viewer),
    tags: tagsByContact([id]).get(id) ?? [],
    leads: toLeadViews(leads, contactsById),
    introducedBy: toLeadViews(introductions, contactsById),
    interactions: db
      .select()
      .from(networkInteractions)
      .where(eq(networkInteractions.contactId, id))
      .orderBy(desc(networkInteractions.occurredOn), desc(networkInteractions.createdAt))
      .all(),
    links: listContactLinks(id),
  };
}

/** Tag names on contacts the viewer can see, for suggestions while typing. */
export function listNetworkTagNames(viewer: NetworkViewer) {
  return db
    .selectDistinct({ name: networkTags.name, normalizedName: networkTags.normalizedName })
    .from(networkTags)
    .innerJoin(networkContactTags, eq(networkContactTags.tagId, networkTags.id))
    .innerJoin(networkContacts, eq(networkContacts.id, networkContactTags.contactId))
    .where(visibleContactCondition(viewer.id))
    .orderBy(asc(networkTags.normalizedName))
    .all()
    .map((row) => row.name);
}

/**
 * Dashboard: active leads on the viewer's own contacts plus those the viewer
 * captured on team contacts, so a shared contact does not flood everyone.
 */
export function listNetworkFollowUps(viewer: NetworkViewer, limit = 8) {
  const rows = db
    .select({ lead: networkLeads })
    .from(networkLeads)
    .innerJoin(networkContacts, eq(networkContacts.id, networkLeads.contactId))
    .where(and(
      inArray(networkLeads.status, ["open", "asked"]),
      or(
        eq(networkContacts.ownerId, viewer.id),
        and(eq(networkContacts.visibility, "team"), eq(networkLeads.createdBy, viewer.id)),
      ),
    ))
    .all()
    .map((row) => row.lead);
  const contactsById = new Map(listNetworkContactOptions(viewer).map((contact) => [contact.id, contact]));
  const leads = toLeadViews(rows, contactsById);
  return { leads: leads.slice(0, limit), total: leads.length };
}
