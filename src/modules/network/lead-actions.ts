"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { canViewContact, loadContact } from "./access";
import { contactFor, fail, revalidateNetwork, type NetworkActionResult } from "./action-helpers";
import { tasks } from "@/db/schema";
import { removeUnusedOrganizations, resolveOrganization } from "./organizations";
import { networkContacts, networkLeads } from "./schema";
import { idSchema, leadSchema, leadStatusSchema, leadTaskLinkSchema, type LeadInput } from "./validation";

function loadLead(id: string) {
  return db.select().from(networkLeads).where(eq(networkLeads.id, id)).get();
}

/** Creates or updates a lead. Moving a lead to another contact is not supported. */
export async function saveNetworkLead(input: LeadInput): Promise<NetworkActionResult<{ id: string }>> {
  const viewer = await requireUserOrThrow();
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { id, ...data } = parsed.data;

  const existing = id ? loadLead(id) : undefined;
  if (id && !existing) return fail("notFound");
  if (existing && existing.contactId !== data.contactId) return fail("invalid");
  const access = contactFor(data.contactId, viewer, "edit");
  if (!access.ok) return access;

  if (data.targetContactId) {
    // Only contacts the viewer can see may be linked, and never the contact itself.
    const target = loadContact(data.targetContactId);
    if (!target || !canViewContact(target, viewer) || target.id === data.contactId) return fail("invalid");
  }

  const now = new Date();
  const leadId = db.transaction((tx) => {
    const organization = resolveOrganization(tx, data.targetOrganization, viewer.id);
    const values = { ...data, targetOrganization: organization?.name ?? "", targetOrganizationId: organization?.id ?? null };
    let id: string;
    if (existing) {
      tx.update(networkLeads).set({ ...values, updatedAt: now }).where(eq(networkLeads.id, existing.id)).run();
      id = existing.id;
    } else {
      id = tx.insert(networkLeads).values({ ...values, createdBy: viewer.id }).returning({ id: networkLeads.id }).get().id;
    }
    tx.update(networkContacts).set({ updatedAt: now }).where(eq(networkContacts.id, data.contactId)).run();
    removeUnusedOrganizations(tx);
    return id;
  });
  revalidateNetwork();
  return { ok: true, id: leadId };
}

export async function setNetworkLeadStatus(input: { id: string; status: string }): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = leadStatusSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const lead = loadLead(parsed.data.id);
  if (!lead) return fail("notFound");
  const access = contactFor(lead.contactId, viewer, "edit");
  if (!access.ok) return access;
  db.update(networkLeads).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(networkLeads.id, lead.id)).run();
  revalidateNetwork();
  return { ok: true };
}

export async function deleteNetworkLead(id: string): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("invalid");
  const lead = loadLead(parsedId.data);
  if (!lead) return fail("notFound");
  const access = contactFor(lead.contactId, viewer, "edit");
  if (!access.ok) return access;
  db.transaction((tx) => {
    tx.delete(networkLeads).where(eq(networkLeads.id, lead.id)).run();
    removeUnusedOrganizations(tx);
  });
  revalidateNetwork();
  return { ok: true };
}

/** Links a task created from a lead's next step, so the lead can show its progress. */
export async function linkNetworkLeadTask(input: { leadId: string; taskId: string }): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = leadTaskLinkSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const lead = loadLead(parsed.data.leadId);
  if (!lead) return fail("notFound");
  const access = contactFor(lead.contactId, viewer, "edit");
  if (!access.ok) return access;
  const task = db.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, parsed.data.taskId)).get();
  if (!task) return fail("invalid");
  db.update(networkLeads).set({ taskId: task.id, updatedAt: new Date() }).where(eq(networkLeads.id, lead.id)).run();
  revalidateNetwork();
  return { ok: true };
}
