import "server-only";

import { eq, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { networkContacts } from "./schema";

export type NetworkViewer = { id: string; role?: string | null };
type ContactAccessRow = { ownerId: string; visibility: "private" | "team" };

/** SQL condition for contacts the viewer may see: their own and every team contact. */
export function visibleContactCondition(viewerId: string): SQL {
  return or(eq(networkContacts.ownerId, viewerId), eq(networkContacts.visibility, "team"))!;
}

/** Private contacts are the owner's alone, even for admins. Team contacts are open to everyone. */
export function canViewContact(contact: ContactAccessRow, viewer: NetworkViewer) {
  return contact.ownerId === viewer.id || contact.visibility === "team";
}

/** Anyone who can see a contact may edit it and its leads. */
export const canEditContact = canViewContact;

/**
 * Deleting and changing visibility stay with the owner. Admins may also do it
 * for team contacts so a shared contact never becomes unmanageable when its
 * owner leaves.
 */
export function canManageContact(contact: ContactAccessRow, viewer: NetworkViewer) {
  return contact.ownerId === viewer.id || (contact.visibility === "team" && viewer.role === "admin");
}

export function loadContact(id: string) {
  return db.select().from(networkContacts).where(eq(networkContacts.id, id)).get();
}
