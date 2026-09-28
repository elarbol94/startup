import "server-only";

import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { canEditContact, canManageContact, visibleContactCondition, type NetworkViewer } from "./access";
import type { LeadStatus } from "./constants";
import { compareContacts, defaultContactListFilter, type ContactListFilter, type NetworkFacet } from "./contact-filters";
import { listContactLinks, type NetworkContactLink } from "./link-queries";
import { compareLeads, isLeadActive, matchesSearch, normalizeText, type Suggestion } from "./network-utils";
import { reconnectDueOn } from "./reconnect-utils";
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
  /** May delete it or change its visibility (see `canManageContact`). */
  canManage: boolean;
  lastContactOn: string | null;
  notYetSpoken: boolean;
  /** Next keep-in-touch date (see `reconnectDueOn`); only for the viewer's own contacts, like the reminders. */
  reconnectDueOn: string | null;
  municipalityName: string | null;
  tags: NetworkTag[];
  /** Summaries of the leads that still need something, soonest first. */
  activeLeads: { id: string; summary: string; kind: string }[];
};

function countFacet(map: Map<string, NetworkFacet>, id: string | null, name: string | null) {
  if (!id) return;
  const entry = map.get(id) ?? { id, name: name || id, count: 0 };
  entry.count += 1;
  map.set(id, entry);
}

const byFacetName = (a: { name: string }, b: { name: string }) =>
  normalizeText(a.name).localeCompare(normalizeText(b.name), "de");

/**
 * "My network": every visible contact, optionally narrowed by a search over
 * the person, their notes and their leads, by tag, relationship, closeness,
 * owner scope, organisation, municipality and "not spoken yet", and sorted. The network is small
 * (hundreds of rows), so filtering happens here, which also gives
 * accent-insensitive matching that SQLite's LIKE cannot.
 *
 * Facets (tags, organisations, municipalities) come from all visible contacts,
 * so options never reveal anything private. A tag, organisation or
 * municipality that is not among them is ignored; `filter` in the result is
 * what was actually applied.
 */
export function listNetworkContacts(viewer: NetworkViewer, filterInput: Partial<ContactListFilter> = {}) {
  const contacts = visibleContacts(viewer);
  const ids = contacts.map((contact) => contact.id);
  const tags = tagsByContact(ids);
  const leads = leadsByContact(ids);
  const allTags = new Map<string, NetworkFacet>();
  for (const contactTags of tags.values()) {
    for (const tag of contactTags) countFacet(allTags, tag.id, tag.name);
  }
  const organizations = new Map<string, NetworkFacet>();
  const municipalities = new Map<string, NetworkFacet>();
  for (const contact of contacts) {
    countFacet(organizations, contact.organizationId, contact.organization);
    countFacet(municipalities, contact.municipalityCode, contact.municipalityName);
  }

  const requested = { ...defaultContactListFilter, ...filterInput };
  const filter: ContactListFilter = {
    ...requested,
    tagId: allTags.has(requested.tagId) ? requested.tagId : "",
    organizationId: organizations.has(requested.organizationId) ? requested.organizationId : "",
    municipalityCode: municipalities.has(requested.municipalityCode) ? requested.municipalityCode : "",
  };

  const matching: typeof contacts = [];
  for (const contact of contacts) {
    const contactTags = tags.get(contact.id) ?? [];
    const contactLeads = leads.get(contact.id) ?? [];
    // Scope narrows the visible contacts; it never widens them.
    if (filter.scope === "mine" && contact.ownerId !== viewer.id) continue;
    if (filter.scope === "team" && contact.visibility !== "team") continue;
    if (filter.relationship && contact.relationship !== filter.relationship) continue;
    if (filter.closeness && contact.closeness !== filter.closeness) continue;
    if (filter.organizationId && contact.organizationId !== filter.organizationId) continue;
    if (filter.municipalityCode && contact.municipalityCode !== filter.municipalityCode) continue;
    if (filter.spoken === "no" && !contact.notYetSpoken) continue;
    if (filter.spoken === "yes" && contact.notYetSpoken) continue;
    if (filter.tagId && !contactTags.some((tag) => tag.id === filter.tagId)) continue;
    if (filter.query && !matchesSearch(filter.query, [
      contact.name, contact.organization, contact.role, contact.metContext, contact.notes, contact.municipalityName,
      ...contactTags.map((tag) => tag.name),
      ...contactLeads.flatMap((lead) => [lead.summary, lead.targetName, lead.targetOrganization, lead.nextStep]),
    ])) continue;
    matching.push(contact);
  }

  // Keep-in-touch cadences are the owner's habit (see `listReconnectDue`), so other people's don't sort.
  const sortable = (contact: (typeof matching)[number]) =>
    contact.ownerId === viewer.id ? contact : { ...contact, reconnectEveryDays: null };
  const compare = compareContacts(filter.sort);
  const items: NetworkContactListItem[] = matching.sort((a, b) => compare(sortable(a), sortable(b))).map((contact) => ({
    id: contact.id,
    name: contact.name,
    organization: contact.organization,
    role: contact.role,
    visibility: contact.visibility,
    isOwn: contact.ownerId === viewer.id,
    canManage: canManageContact(contact, viewer),
    lastContactOn: contact.lastContactOn,
    notYetSpoken: contact.notYetSpoken,
    reconnectDueOn: contact.ownerId === viewer.id ? reconnectDueOn(contact.lastContactOn, contact.reconnectEveryDays) : null,
    municipalityName: contact.municipalityName,
    tags: tags.get(contact.id) ?? [],
    activeLeads: (leads.get(contact.id) ?? [])
      .filter((lead) => isLeadActive(lead.status))
      .map((lead) => ({ id: lead.id, summary: lead.summary, kind: lead.kind })),
  }));
  return {
    contacts: items,
    total: contacts.length,
    filter,
    tags: [...allTags.values()].sort(byFacetName),
    organizations: [...organizations.values()].sort(byFacetName),
    municipalities: [...municipalities.values()].sort(byFacetName),
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

/** Tags on contacts the viewer can see, most used first, for the tag input. */
export function listNetworkTagSuggestions(viewer: NetworkViewer): Suggestion[] {
  const rows = db
    .select({ name: networkTags.name, contactId: networkContactTags.contactId })
    .from(networkTags)
    .innerJoin(networkContactTags, eq(networkContactTags.tagId, networkTags.id))
    .innerJoin(networkContacts, eq(networkContacts.id, networkContactTags.contactId))
    .where(visibleContactCondition(viewer.id))
    .all();
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || normalizeText(a.value).localeCompare(normalizeText(b.value), "de"));
}

/**
 * "Met at" values already used on visible contacts, most recently used first.
 * Spellings that differ only in case or accents are one entry, shown as last written.
 */
export function listNetworkMetContextSuggestions(viewer: NetworkViewer): Suggestion[] {
  const rows = db
    .select({ value: networkContacts.metContext, updatedAt: networkContacts.updatedAt })
    .from(networkContacts)
    .where(and(visibleContactCondition(viewer.id), ne(networkContacts.metContext, "")))
    .orderBy(desc(networkContacts.updatedAt))
    .all();
  const grouped = new Map<string, Suggestion>();
  for (const row of rows) {
    const key = normalizeText(row.value);
    const entry = grouped.get(key);
    if (entry) entry.count += 1;
    else grouped.set(key, { value: row.value.trim(), count: 1 });
  }
  return [...grouped.values()];
}
