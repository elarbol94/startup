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

/*
 * Invariant for `networkContacts.lastContactOn`:
 * - It can be set by hand (contact edit form) to any date, or cleared.
 * - Logging or editing an interaction only ever moves it *forward* to that
 *   interaction's date (`bumpLastContact`); it never moves back on its own.
 * - When an interaction is removed, or its date changes, and the stored value
 *   equals the interaction's old date, it falls back to the latest remaining
 *   interaction (`syncLastContactAfterRemoval`), or null if none remain.
 *
 * Known, accepted limitation: date equality is the only provenance signal.
 * A date entered by hand that happens to equal an interaction's date is treated
 * as coming from that interaction and may be replaced by the fallback. There is
 * deliberately no extra "source" column for this.
 */

/** Moves the contact's last-contact date forward to `occurredOn`, never back. */
export function bumpLastContact(tx: Transaction, contactId: string, occurredOn: string) {
  const contact = tx.select({ lastContactOn: networkContacts.lastContactOn }).from(networkContacts).where(eq(networkContacts.id, contactId)).get();
  const lastContactOn = contact?.lastContactOn && contact.lastContactOn > occurredOn ? contact.lastContactOn : occurredOn;
  tx.update(networkContacts).set({ lastContactOn, updatedAt: new Date() }).where(eq(networkContacts.id, contactId)).run();
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
  bumpLastContact(tx, input.contactId, input.occurredOn);
  return id;
}

/**
 * After removing a touchpoint (or moving it away from `removedOn`): if the
 * last-contact date came from it, fall back to the latest remaining one.
 * A date entered by hand is left alone (see the invariant above).
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

/**
 * Edits a touchpoint in place (id, contact and author stay the same) and keeps
 * the last-contact date consistent when its date changes.
 */
export function editInteraction(
  tx: Transaction,
  existing: { id: string; contactId: string; occurredOn: string },
  input: { occurredOn: string; channel: InteractionChannel; note: string },
) {
  tx.update(networkInteractions)
    .set({ occurredOn: input.occurredOn, channel: input.channel, note: input.note })
    .where(eq(networkInteractions.id, existing.id))
    .run();
  if (existing.occurredOn === input.occurredOn) return;
  // The row already carries the new date, so the fallback may pick it up itself.
  syncLastContactAfterRemoval(tx, existing.contactId, existing.occurredOn);
  bumpLastContact(tx, existing.contactId, input.occurredOn);
}

export function removeUnusedTags(tx: Transaction) {
  const used = tx.selectDistinct({ id: networkContactTags.tagId }).from(networkContactTags);
  tx.delete(networkTags).where(notInArray(networkTags.id, used)).run();
}

/**
 * The layout lists contacts for quick capture, so every network page depends
 * on the data; the dashboard shows follow-ups and people to reconnect with.
 */
export function revalidateNetwork() {
  revalidatePath("/network", "layout");
  revalidatePath("/");
}
