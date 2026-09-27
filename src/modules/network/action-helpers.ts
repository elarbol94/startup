import "server-only";

import { desc, eq, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { canEditContact, canManageContact, canViewContact, loadContact, type NetworkViewer } from "./access";
import { normalizeText, parseTagInput } from "./network-utils";
import type { InteractionChannel } from "./constants";
import { networkContacts, networkContactTags, networkInteractions, networkTags } from "./schema";

export type NetworkActionError = "invalid" | "notFound" | "forbidden" | "duplicate";
export type NetworkActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: NetworkActionError };

export const fail = (error: NetworkActionError) => ({ ok: false as const, error });

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Loads a contact for a mutation. A contact the viewer cannot see answers
 * "notFound" rather than "forbidden", so private contacts do not leak their existence.
 */
export function contactFor(id: string, viewer: NetworkViewer, level: "edit" | "manage") {
  const contact = loadContact(id);
  if (!contact || !canViewContact(contact, viewer)) return fail("notFound");
  const allowed = level === "manage" ? canManageContact(contact, viewer) : canEditContact(contact, viewer);
  return allowed ? { ok: true as const, contact } : fail("forbidden");
}

/** Replaces a contact's tags, creating missing ones and dropping tags nobody uses any more. */
export function replaceContactTags(tx: Transaction, contactId: string, input: readonly string[], userId: string) {
  const names = parseTagInput(input);
  const tagIds = names.map((name) => {
    const normalizedName = normalizeText(name);
    const existing = tx.select({ id: networkTags.id }).from(networkTags).where(eq(networkTags.normalizedName, normalizedName)).get();
    if (existing) return existing.id;
    return tx.insert(networkTags).values({ name, normalizedName, createdBy: userId }).returning({ id: networkTags.id }).get().id;
  });
  tx.delete(networkContactTags).where(eq(networkContactTags.contactId, contactId)).run();
  if (tagIds.length) tx.insert(networkContactTags).values(tagIds.map((tagId) => ({ contactId, tagId }))).run();
  removeUnusedTags(tx);
}

/** Logs a touchpoint and moves the contact's last-contact date forward, never back. */
export function recordInteraction(
  tx: Transaction,
  input: { contactId: string; occurredOn: string; channel: InteractionChannel; note: string; userId: string },
) {
  const id = tx
    .insert(networkInteractions)
    .values({ contactId: input.contactId, occurredOn: input.occurredOn, channel: input.channel, note: input.note, createdBy: input.userId })
    .returning({ id: networkInteractions.id })
    .get().id;
  const contact = tx.select({ lastContactOn: networkContacts.lastContactOn }).from(networkContacts).where(eq(networkContacts.id, input.contactId)).get();
  const lastContactOn = contact?.lastContactOn && contact.lastContactOn > input.occurredOn ? contact.lastContactOn : input.occurredOn;
  tx.update(networkContacts).set({ lastContactOn, updatedAt: new Date() }).where(eq(networkContacts.id, input.contactId)).run();
  return id;
}

/**
 * After removing a touchpoint: if the last-contact date came from it, fall
 * back to the latest remaining one. A date entered by hand is left alone.
 */
export function syncLastContactAfterRemoval(tx: Transaction, contactId: string, removedOn: string) {
  const contact = tx.select({ lastContactOn: networkContacts.lastContactOn }).from(networkContacts).where(eq(networkContacts.id, contactId)).get();
  if (!contact || contact.lastContactOn !== removedOn) return;
  const latest = tx
    .select({ occurredOn: networkInteractions.occurredOn })
    .from(networkInteractions)
    .where(eq(networkInteractions.contactId, contactId))
    .orderBy(desc(networkInteractions.occurredOn))
    .get();
  tx.update(networkContacts).set({ lastContactOn: latest?.occurredOn ?? null, updatedAt: new Date() }).where(eq(networkContacts.id, contactId)).run();
}

export function removeUnusedTags(tx: Transaction) {
  const used = tx.selectDistinct({ id: networkContactTags.tagId }).from(networkContactTags);
  tx.delete(networkTags).where(notInArray(networkTags.id, used)).run();
}

/** The layout lists contacts for quick capture, so every network page depends on the data. */
export function revalidateNetwork() {
  revalidatePath("/network", "layout");
}
