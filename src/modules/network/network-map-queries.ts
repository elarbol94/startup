import "server-only";

import { and, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/db";
import { visibleContactCondition, type NetworkViewer } from "./access";
import { isContactListFiltered, type ContactListFilter } from "./contact-filters";
import type { NetworkMapData, NetworkMapIntroduction, NetworkMapOrganization } from "./network-map";
import { isLeadActive } from "./network-utils";
import { listNetworkOrganizations } from "./organization-queries";
import { listNetworkContacts } from "./queries";
import { networkContacts, networkLeads, networkOrganizations } from "./schema";

/**
 * Everything the network map draws, limited to what the viewer may see. People
 * are filtered exactly like the list (`listNetworkContacts`); the residence
 * filter is dropped because on the map the municipality is the selection.
 * Organisations without a matching person only show while nothing is filtered.
 */
export function getNetworkMap(viewer: NetworkViewer, filterInput: Partial<ContactListFilter>) {
  const list = listNetworkContacts(viewer, { ...filterInput, municipalityCode: "", sort: "name" });
  const people = list.contacts.map((contact) => ({
    id: contact.id,
    name: contact.name,
    role: contact.role,
    organization: contact.organization,
    organizationId: contact.organizationId,
    visibility: contact.visibility,
    closeness: contact.closeness,
    lastContactOn: contact.lastContactOn,
    reconnectDueOn: contact.reconnectDueOn,
    municipalityCode: contact.municipalityCode,
    activeLeads: contact.activeLeads.length,
  }));

  const visibleOrganizationIds = listNetworkOrganizations(viewer).map((organization) => organization.id);
  const located = visibleOrganizationIds.length
    ? db
        .select({ id: networkOrganizations.id, name: networkOrganizations.name, municipalityCode: networkOrganizations.municipalityCode })
        .from(networkOrganizations)
        .where(and(inArray(networkOrganizations.id, visibleOrganizationIds), isNotNull(networkOrganizations.municipalityCode)))
        .all()
    : [];
  const organizationCode = new Map(located.map((organization) => [organization.id, organization.municipalityCode!]));
  const workplaces = new Set(people.flatMap((person) => (person.organizationId ? [person.organizationId] : [])));
  const filtered = isContactListFiltered(list.filter);
  const organizations: NetworkMapOrganization[] = located
    .filter((organization) => !filtered || workplaces.has(organization.id))
    .map((organization) => ({ id: organization.id, name: organization.name, municipalityCode: organization.municipalityCode! }));

  return {
    people,
    organizations,
    introductions: introductionsFor(viewer, people.map((person) => person.id), organizationCode),
    filter: list.filter,
    total: list.total,
    tags: list.tags,
    organizationFacets: list.organizations,
  } satisfies NetworkMapData & Record<string, unknown>;
}

export type NetworkMapPayload = ReturnType<typeof getNetworkMap>;

/**
 * Active leads of the given people that point at a visible person or a
 * located, visible organisation, reduced to where those targets are. Targets
 * the viewer may not see never become a line.
 */
function introductionsFor(viewer: NetworkViewer, contactIds: string[], organizationCode: Map<string, string>): NetworkMapIntroduction[] {
  if (!contactIds.length) return [];
  const leads = db
    .select({
      contactId: networkLeads.contactId,
      status: networkLeads.status,
      targetContactId: networkLeads.targetContactId,
      targetOrganizationId: networkLeads.targetOrganizationId,
    })
    .from(networkLeads)
    .where(and(
      inArray(networkLeads.contactId, contactIds),
      or(isNotNull(networkLeads.targetContactId), isNotNull(networkLeads.targetOrganizationId)),
    ))
    .all()
    .filter((lead) => isLeadActive(lead.status));
  const targetContactIds = [...new Set(leads.flatMap((lead) => (lead.targetContactId ? [lead.targetContactId] : [])))];
  const targets = new Map(
    targetContactIds.length
      ? db
          .select({ id: networkContacts.id, municipalityCode: networkContacts.municipalityCode, organizationId: networkContacts.organizationId })
          .from(networkContacts)
          .where(and(inArray(networkContacts.id, targetContactIds), visibleContactCondition(viewer.id)))
          .all()
          .map((contact) => [contact.id, contact])
      : [],
  );
  return leads.flatMap((lead) => {
    const target = lead.targetContactId ? targets.get(lead.targetContactId) : undefined;
    const codes = [
      target?.municipalityCode,
      target?.organizationId ? organizationCode.get(target.organizationId) : undefined,
      lead.targetOrganizationId ? organizationCode.get(lead.targetOrganizationId) : undefined,
    ].filter((code): code is string => Boolean(code));
    return codes.length ? [{ contactId: lead.contactId, targetCodes: [...new Set(codes)] }] : [];
  });
}
