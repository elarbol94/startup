"use server";

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { bulkIdsSchema, bulkOutcome, type BulkOutcome, type BulkSkipReason } from "@/lib/bulk";
import { contactFor, contactTagNames, removeUnusedTags, replaceContactTags, revalidateNetwork } from "./action-helpers";
import { contactVisibilities, leadStatuses } from "./constants";
import { MAX_TAG_LENGTH, MAX_TAGS_PER_CONTACT, normalizeText, parseTagInput } from "./network-utils";
import { removeUnusedOrganizations } from "./organizations";
import { networkContacts, networkLeads } from "./schema";

/*
 * Bulk variants of the contact and lead actions. Access is checked per item with
 * the same rules as the single actions; contacts the viewer cannot see come back
 * as "notFound" so private contacts do not leak. Everything allowed runs in one
 * transaction.
 */

type Viewer = Awaited<ReturnType<typeof requireUserOrThrow>>;

function checkContacts(ids: string[], viewer: Viewer, level: "edit" | "manage") {
  const allowed: NonNullable<Extract<ReturnType<typeof contactFor>, { ok: true }>["contact"]>[] = [];
  const skipped: BulkOutcome["skipped"] = [];
  for (const id of ids) {
    const access = contactFor(id, viewer, level);
    if (access.ok) allowed.push(access.contact);
    else skipped.push({ id, reason: access.error as BulkSkipReason });
  }
  return { allowed, skipped };
}

const tagListSchema = z.array(z.string().trim().min(1).max(MAX_TAG_LENGTH * 2)).max(MAX_TAGS_PER_CONTACT).default([]);
const contactTagsSchema = z.object({ ids: bulkIdsSchema, add: tagListSchema, remove: tagListSchema })
  .refine((data) => data.add.length + data.remove.length > 0, { message: "Nothing to change" });

/** Adds and removes tags (by name) on each contact, leaving its other tags alone. */
export async function bulkUpdateContactTags(input: z.input<typeof contactTagsSchema>): Promise<BulkOutcome> {
  const viewer = await requireUserOrThrow();
  const data = contactTagsSchema.parse(input);
  const add = parseTagInput(data.add);
  const addKeys = new Set(add.map(normalizeText));
  const remove = new Set(data.remove.map(normalizeText).filter((key) => !addKeys.has(key)));
  const { allowed, skipped } = checkContacts(data.ids, viewer, "edit");
  const succeeded: string[] = [];
  db.transaction((tx) => {
    for (const contact of allowed) {
      const current = contactTagNames(tx, contact.id);
      const kept = current.filter((name) => !remove.has(normalizeText(name)));
      const keys = new Set(kept.map(normalizeText));
      const next = [...kept, ...add.filter((name) => !keys.has(normalizeText(name)))];
      if (next.length > MAX_TAGS_PER_CONTACT) {
        skipped.push({ id: contact.id, reason: "tooManyTags" });
        continue;
      }
      succeeded.push(contact.id);
      if (next.length === current.length && next.every((name, index) => name === current[index])) continue;
      replaceContactTags(tx, contact.id, next, viewer.id);
      tx.update(networkContacts).set({ updatedAt: new Date() }).where(eq(networkContacts.id, contact.id)).run();
    }
    removeUnusedTags(tx);
  });
  revalidateNetwork();
  return bulkOutcome(data.ids.filter((id) => succeeded.includes(id)), skipped);
}

const visibilitySchema = z.object({ ids: bulkIdsSchema, visibility: z.enum(contactVisibilities) });

export async function bulkSetContactVisibility(input: z.input<typeof visibilitySchema>): Promise<BulkOutcome> {
  const viewer = await requireUserOrThrow();
  const data = visibilitySchema.parse(input);
  const { allowed, skipped } = checkContacts(data.ids, viewer, "manage");
  const ids = allowed.filter((contact) => contact.visibility !== data.visibility).map((contact) => contact.id);
  if (ids.length) db.update(networkContacts).set({ visibility: data.visibility, updatedAt: new Date() }).where(inArray(networkContacts.id, ids)).run();
  revalidateNetwork();
  return bulkOutcome(allowed.map((contact) => contact.id), skipped);
}

const idsSchema = z.object({ ids: bulkIdsSchema });

/** Deletes contacts the viewer manages; leads that introduced them keep their name. */
export async function bulkDeleteContacts(input: z.input<typeof idsSchema>): Promise<BulkOutcome> {
  const viewer = await requireUserOrThrow();
  const data = idsSchema.parse(input);
  const { allowed, skipped } = checkContacts(data.ids, viewer, "manage");
  db.transaction((tx) => {
    for (const contact of allowed) {
      tx.update(networkLeads)
        .set({ targetName: contact.name })
        .where(and(eq(networkLeads.targetContactId, contact.id), eq(networkLeads.targetName, "")))
        .run();
      tx.delete(networkContacts).where(eq(networkContacts.id, contact.id)).run();
    }
    removeUnusedTags(tx);
    removeUnusedOrganizations(tx);
  });
  revalidateNetwork();
  return bulkOutcome(allowed.map((contact) => contact.id), skipped);
}

function checkLeads(ids: string[], viewer: Viewer) {
  const leads = db.select().from(networkLeads).where(inArray(networkLeads.id, ids)).all();
  const byId = new Map(leads.map((lead) => [lead.id, lead]));
  const allowed: typeof leads = [];
  const skipped: BulkOutcome["skipped"] = [];
  for (const id of ids) {
    const lead = byId.get(id);
    const access = lead ? contactFor(lead.contactId, viewer, "edit") : null;
    if (lead && access?.ok) allowed.push(lead);
    else skipped.push({ id, reason: (access && !access.ok ? access.error : "notFound") as BulkSkipReason });
  }
  return { allowed, skipped };
}

const leadStatusSchema = z.object({ ids: bulkIdsSchema, status: z.enum(leadStatuses) });

export async function bulkSetLeadStatus(input: z.input<typeof leadStatusSchema>): Promise<BulkOutcome> {
  const viewer = await requireUserOrThrow();
  const data = leadStatusSchema.parse(input);
  const { allowed, skipped } = checkLeads(data.ids, viewer);
  const ids = allowed.filter((lead) => lead.status !== data.status).map((lead) => lead.id);
  if (ids.length) db.update(networkLeads).set({ status: data.status, updatedAt: new Date() }).where(inArray(networkLeads.id, ids)).run();
  revalidateNetwork();
  return bulkOutcome(allowed.map((lead) => lead.id), skipped);
}

export async function bulkDeleteLeads(input: z.input<typeof idsSchema>): Promise<BulkOutcome> {
  const viewer = await requireUserOrThrow();
  const data = idsSchema.parse(input);
  const { allowed, skipped } = checkLeads(data.ids, viewer);
  db.transaction((tx) => {
    if (allowed.length) tx.delete(networkLeads).where(inArray(networkLeads.id, allowed.map((lead) => lead.id))).run();
    removeUnusedOrganizations(tx);
  });
  revalidateNetwork();
  return bulkOutcome(allowed.map((lead) => lead.id), skipped);
}
