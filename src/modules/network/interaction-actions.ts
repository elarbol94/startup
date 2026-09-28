"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import {
  contactFor,
  editInteraction,
  fail,
  recordInteraction,
  revalidateNetwork,
  syncLastContactAfterRemoval,
  type NetworkActionResult,
} from "./action-helpers";
import { networkInteractions } from "./schema";
import {
  idSchema,
  interactionSchema,
  interactionUpdateSchema,
  type InteractionInput,
  type InteractionUpdateInput,
} from "./validation";

export async function addNetworkInteraction(input: InteractionInput): Promise<NetworkActionResult<{ id: string }>> {
  const viewer = await requireUserOrThrow();
  const parsed = interactionSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const access = contactFor(parsed.data.contactId, viewer, "edit");
  if (!access.ok) return access;
  const id = db.transaction((tx) => recordInteraction(tx, { ...parsed.data, userId: viewer.id }));
  revalidateNetwork();
  return { ok: true, id };
}

export async function deleteNetworkInteraction(id: string): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("invalid");
  const interaction = db.select().from(networkInteractions).where(eq(networkInteractions.id, parsedId.data)).get();
  if (!interaction) return fail("notFound");
  const access = contactFor(interaction.contactId, viewer, "edit");
  if (!access.ok) return access;
  db.transaction((tx) => {
    tx.delete(networkInteractions).where(eq(networkInteractions.id, interaction.id)).run();
    syncLastContactAfterRemoval(tx, interaction.contactId, interaction.occurredOn);
  });
  revalidateNetwork();
  return { ok: true };
}

/** Corrects a touchpoint's date, channel or note. It always stays on its contact. */
export async function updateNetworkInteraction(input: InteractionUpdateInput): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = interactionUpdateSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const interaction = db.select().from(networkInteractions).where(eq(networkInteractions.id, parsed.data.id)).get();
  if (!interaction) return fail("notFound");
  // Authorise against the stored contact, never one supplied by the client.
  const access = contactFor(interaction.contactId, viewer, "edit");
  if (!access.ok) return access;
  db.transaction((tx) => editInteraction(tx, interaction, parsed.data));
  revalidateNetwork();
  return { ok: true };
}
