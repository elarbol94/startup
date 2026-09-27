import "server-only";

import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { visibleContactCondition, type NetworkViewer } from "./access";
import { listNetworkOrganizations } from "./organization-queries";
import { networkContacts, networkOrganizations } from "./schema";

type Person = { id: string; name: string; role: string; organization: string; visibility: "private" | "team" };

export type MunicipalityNetwork = {
  /** Visible contacts who live in the municipality. */
  residents: Person[];
  /** Organisations located there (such as the municipality itself), with the visible people at each. */
  organizations: { id: string; name: string; people: Person[] }[];
};

const personColumns = {
  id: networkContacts.id,
  name: networkContacts.name,
  role: networkContacts.role,
  organization: networkContacts.organization,
  visibility: networkContacts.visibility,
};

/** What the network knows about one municipality, limited to what the viewer may see. */
export function getMunicipalityNetwork(viewer: NetworkViewer, municipalityCode: string): MunicipalityNetwork {
  const residents = db
    .select(personColumns)
    .from(networkContacts)
    .where(and(eq(networkContacts.municipalityCode, municipalityCode), visibleContactCondition(viewer.id)))
    .orderBy(asc(networkContacts.name))
    .all();
  const visibleOrganizationIds = new Set(listNetworkOrganizations(viewer).map((organization) => organization.id));
  const organizations = db
    .select({ id: networkOrganizations.id, name: networkOrganizations.name })
    .from(networkOrganizations)
    .where(eq(networkOrganizations.municipalityCode, municipalityCode))
    .orderBy(asc(networkOrganizations.normalizedName))
    .all()
    .filter((organization) => visibleOrganizationIds.has(organization.id));
  const people = organizations.length
    ? db
        .select({ ...personColumns, organizationId: networkContacts.organizationId })
        .from(networkContacts)
        .where(and(inArray(networkContacts.organizationId, organizations.map((organization) => organization.id)), visibleContactCondition(viewer.id)))
        .orderBy(asc(networkContacts.name))
        .all()
    : [];
  return {
    residents,
    organizations: organizations.map((organization) => ({
      ...organization,
      people: people
        .filter((person) => person.organizationId === organization.id)
        .map((person) => ({ id: person.id, name: person.name, role: person.role, organization: person.organization, visibility: person.visibility })),
    })),
  };
}

export type MunicipalityContactCount = { code: string; residents: number; atOrganizations: number; total: number };

/**
 * For the map overlay: how many visible people the network has per
 * municipality, counting those who live there and those at an organisation
 * located there. A person counts once per municipality even if both apply.
 */
export function countNetworkContactsByMunicipality(viewer: NetworkViewer): MunicipalityContactCount[] {
  const contacts = db
    .select({ id: networkContacts.id, municipalityCode: networkContacts.municipalityCode, organizationId: networkContacts.organizationId })
    .from(networkContacts)
    .where(visibleContactCondition(viewer.id))
    .all();
  const organizationIds = [...new Set(contacts.flatMap((contact) => (contact.organizationId ? [contact.organizationId] : [])))];
  const organizationMunicipality = new Map(
    organizationIds.length
      ? db
          .select({ id: networkOrganizations.id, municipalityCode: networkOrganizations.municipalityCode })
          .from(networkOrganizations)
          .where(and(inArray(networkOrganizations.id, organizationIds), isNotNull(networkOrganizations.municipalityCode)))
          .all()
          .map((organization) => [organization.id, organization.municipalityCode!])
      : [],
  );
  const counts = new Map<string, { residents: Set<string>; atOrganizations: Set<string> }>();
  const entry = (code: string) => counts.get(code) ?? counts.set(code, { residents: new Set(), atOrganizations: new Set() }).get(code)!;
  for (const contact of contacts) {
    if (contact.municipalityCode) entry(contact.municipalityCode).residents.add(contact.id);
    const workplace = contact.organizationId ? organizationMunicipality.get(contact.organizationId) : undefined;
    if (workplace) entry(workplace).atOrganizations.add(contact.id);
  }
  return [...counts].map(([code, { residents, atOrganizations }]) => ({
    code,
    residents: residents.size,
    atOrganizations: atOrganizations.size,
    total: new Set([...residents, ...atOrganizations]).size,
  }));
}
