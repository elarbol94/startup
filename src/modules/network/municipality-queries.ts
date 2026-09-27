import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";
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
