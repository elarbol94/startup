"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";
import {
  contactFor,
  fail,
  recordInteraction,
  removeUnusedTags,
  replaceContactTags,
  revalidateNetwork,
  type NetworkActionResult,
} from "./action-helpers";
import { municipalityColumns } from "./municipalities.server";
import { removeUnusedOrganizations, resolveOrganization } from "./organizations";
import { networkContacts, networkContactTags, networkInteractions, networkLeads, networkTags } from "./schema";
import {
  contactSchema,
  contactTagsSchema,
  idSchema,
  quickCaptureSchema,
  visibilitySchema,
  type ContactInput,
  type QuickCaptureInput,
} from "./validation";

/**
 * Quick capture right after a conversation: adds a new contact (private) or
 * picks an existing one, records what they said as an open lead and merges
 * the tags.
 */
export async function quickCaptureContact(input: QuickCaptureInput): Promise<NetworkActionResult<{ contactId: string }>> {
  const viewer = await requireUserOrThrow();
  const parsed = quickCaptureSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const data = parsed.data;

  if (data.contactId) {
    const access = contactFor(data.contactId, viewer, "edit");
    if (!access.ok) return access;
  }
  const municipality = municipalityColumns(data.contactId ? null : data.municipalityCode);
  if (!municipality) return fail("invalid");

  const contactId = db.transaction((tx) => {
    const id = data.contactId ?? tx
      .insert(networkContacts)
      .values({ ownerId: viewer.id, name: data.name, metContext: data.metContext, ...municipality })
      .returning({ id: networkContacts.id })
      .get().id;
    if (data.contactId) {
      tx.update(networkContacts).set({ updatedAt: new Date() }).where(eq(networkContacts.id, id)).run();
    }
    if (data.metToday) {
      // Several captures after one conversation should log it once.
      const occurredOn = localDateInZone(new Date(), TIME_ZONE);
      const logged = tx
        .select({ id: networkInteractions.id })
        .from(networkInteractions)
        .where(and(eq(networkInteractions.contactId, id), eq(networkInteractions.occurredOn, occurredOn)))
        .get();
      if (!logged) recordInteraction(tx, { contactId: id, occurredOn, channel: "meeting", note: "", userId: viewer.id });
    }
    if (data.note) {
      tx.insert(networkLeads).values({ contactId: id, kind: data.kind, summary: data.note, createdBy: viewer.id }).run();
    }
    if (data.tags.length) {
      const current = data.contactId ? contactTagNames(tx, id) : [];
      replaceContactTags(tx, id, [...current, ...data.tags], viewer.id);
    }
    return id;
  });
  revalidateNetwork();
  return { ok: true, contactId };
}

function contactTagNames(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], contactId: string) {
  return tx
    .select({ name: networkTags.name })
    .from(networkContactTags)
    .innerJoin(networkTags, eq(networkTags.id, networkContactTags.tagId))
    .where(eq(networkContactTags.contactId, contactId))
    .all()
    .map((row) => row.name);
}

export async function updateNetworkContact(input: ContactInput): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = contactSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { id, municipalityCode, ...values } = parsed.data;
  const access = contactFor(id, viewer, "edit");
  if (!access.ok) return access;
  const municipality = municipalityColumns(municipalityCode);
  if (!municipality) return fail("invalid");
  db.transaction((tx) => {
    const organization = resolveOrganization(tx, values.organization, viewer.id);
    tx.update(networkContacts)
      .set({ ...values, ...municipality, organization: organization?.name ?? "", organizationId: organization?.id ?? null, updatedAt: new Date() })
      .where(eq(networkContacts.id, id))
      .run();
    removeUnusedOrganizations(tx);
  });
  revalidateNetwork();
  return { ok: true };
}

/** "Spoke to them today": logs a conversation for today without opening a form. */
export async function markNetworkContactContacted(id: string): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("invalid");
  const access = contactFor(parsedId.data, viewer, "edit");
  if (!access.ok) return access;
  const occurredOn = localDateInZone(new Date(), TIME_ZONE);
  db.transaction((tx) => recordInteraction(tx, { contactId: access.contact.id, occurredOn, channel: "meeting", note: "", userId: viewer.id }));
  revalidateNetwork();
  return { ok: true };
}

export async function setNetworkContactVisibility(input: { contactId: string; visibility: string }): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = visibilitySchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const access = contactFor(parsed.data.contactId, viewer, "manage");
  if (!access.ok) return access;
  db.update(networkContacts)
    .set({ visibility: parsed.data.visibility, updatedAt: new Date() })
    .where(eq(networkContacts.id, access.contact.id))
    .run();
  revalidateNetwork();
  return { ok: true };
}

export async function setNetworkContactTags(input: { contactId: string; tags: string[] }): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = contactTagsSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const access = contactFor(parsed.data.contactId, viewer, "edit");
  if (!access.ok) return access;
  db.transaction((tx) => replaceContactTags(tx, access.contact.id, parsed.data.tags, viewer.id));
  revalidateNetwork();
  return { ok: true };
}

/** Removes the contact with its leads and tag links; leads elsewhere keep their free-text target. */
export async function deleteNetworkContact(id: string): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("invalid");
  const access = contactFor(parsedId.data, viewer, "manage");
  if (!access.ok) return access;
  const { contact } = access;
  db.transaction((tx) => {
    // Keep the name on leads that introduced this person so "Felix → friend" survives.
    tx.update(networkLeads)
      .set({ targetName: contact.name })
      .where(and(eq(networkLeads.targetContactId, contact.id), eq(networkLeads.targetName, "")))
      .run();
    tx.delete(networkContacts).where(eq(networkContacts.id, contact.id)).run();
    removeUnusedTags(tx);
    removeUnusedOrganizations(tx);
  });
  revalidateNetwork();
  return { ok: true };
}
