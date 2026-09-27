import "server-only";

import { and, eq, isNotNull, isNull, ne, notInArray } from "drizzle-orm";
import { db } from "@/db";
import { normalizeText } from "./network-utils";
import { networkContacts, networkLeads, networkOrganizations } from "./schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Database = Transaction | typeof db;

/**
 * Finds the organisation for a typed name, creating it on first use. Returns
 * null for an empty name. Matching ignores case and accents, and the stored
 * spelling wins so every contact shows the same name.
 */
export function resolveOrganization(tx: Database, name: string, userId: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const normalizedName = normalizeText(trimmed);
  if (!normalizedName) return null;
  const existing = tx
    .select({ id: networkOrganizations.id, name: networkOrganizations.name })
    .from(networkOrganizations)
    .where(eq(networkOrganizations.normalizedName, normalizedName))
    .get();
  if (existing) return existing;
  return tx
    .insert(networkOrganizations)
    .values({ name: trimmed, normalizedName, createdBy: userId })
    .returning({ id: networkOrganizations.id, name: networkOrganizations.name })
    .get();
}

/**
 * Drops organisations nothing refers to any more, unless someone added a
 * website or notes to them. Keeps typos from piling up.
 */
export function removeUnusedOrganizations(tx: Database) {
  // NOT IN over a NULL would match nothing, hence the IS NOT NULL filters.
  const usedByContacts = tx
    .selectDistinct({ id: networkContacts.organizationId })
    .from(networkContacts)
    .where(isNotNull(networkContacts.organizationId));
  const usedByLeads = tx
    .selectDistinct({ id: networkLeads.targetOrganizationId })
    .from(networkLeads)
    .where(isNotNull(networkLeads.targetOrganizationId));
  tx.delete(networkOrganizations)
    .where(and(
      notInArray(networkOrganizations.id, usedByContacts),
      notInArray(networkOrganizations.id, usedByLeads),
      eq(networkOrganizations.website, ""),
      eq(networkOrganizations.notes, ""),
    ))
    .run();
}

/**
 * Links organisation names typed before organisations existed. Idempotent;
 * runs on every start and only touches rows that still lack a link.
 */
export function backfillNetworkOrganizations() {
  db.transaction((tx) => {
    const contacts = tx
      .select({ id: networkContacts.id, organization: networkContacts.organization, ownerId: networkContacts.ownerId })
      .from(networkContacts)
      .where(and(isNull(networkContacts.organizationId), ne(networkContacts.organization, "")))
      .all();
    for (const contact of contacts) {
      const organization = resolveOrganization(tx, contact.organization, contact.ownerId);
      if (!organization) continue;
      tx.update(networkContacts)
        .set({ organizationId: organization.id, organization: organization.name })
        .where(eq(networkContacts.id, contact.id))
        .run();
    }
    const leads = tx
      .select({ id: networkLeads.id, targetOrganization: networkLeads.targetOrganization, createdBy: networkLeads.createdBy })
      .from(networkLeads)
      .where(and(isNull(networkLeads.targetOrganizationId), ne(networkLeads.targetOrganization, "")))
      .all();
    for (const lead of leads) {
      const organization = resolveOrganization(tx, lead.targetOrganization, lead.createdBy);
      if (!organization) continue;
      tx.update(networkLeads)
        .set({ targetOrganizationId: organization.id, targetOrganization: organization.name })
        .where(eq(networkLeads.id, lead.id))
        .run();
    }
  });
}
