"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { contactFor, fail, revalidateNetwork, type NetworkActionResult } from "./action-helpers";
import { contactLinkTargetTypes } from "./constants";
import { searchLinkTargets, targetExists, type NetworkLinkTarget } from "./link-queries";
import { networkContactLinks } from "./schema";
import { idSchema } from "./validation";

const linkSchema = z.object({ contactId: idSchema, targetType: z.enum(contactLinkTargetTypes), targetId: idSchema });

/** Pages that show linked contacts next to the target. */
function revalidateTarget(type: (typeof contactLinkTargetTypes)[number], id: string) {
  revalidateNetwork();
  if (type === "project") revalidatePath(`/projects/${id}`);
  if (type === "fundingProject") revalidatePath(`/accounting/funding-projects/${id}`);
}

export async function linkNetworkContact(input: z.input<typeof linkSchema>): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = linkSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { contactId, targetType, targetId } = parsed.data;
  const access = contactFor(contactId, viewer, "edit");
  if (!access.ok) return access;
  if (!targetExists(targetType, targetId)) return fail("invalid");
  db.insert(networkContactLinks).values({ contactId, targetType, targetId, createdBy: viewer.id }).onConflictDoNothing().run();
  revalidateTarget(targetType, targetId);
  return { ok: true };
}

export async function unlinkNetworkContact(linkId: string): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsedId = idSchema.safeParse(linkId);
  if (!parsedId.success) return fail("invalid");
  const link = db.select().from(networkContactLinks).where(eq(networkContactLinks.id, parsedId.data)).get();
  if (!link) return fail("notFound");
  const access = contactFor(link.contactId, viewer, "edit");
  if (!access.ok) return access;
  db.delete(networkContactLinks).where(eq(networkContactLinks.id, link.id)).run();
  revalidateTarget(link.targetType, link.targetId);
  return { ok: true };
}

export async function searchNetworkLinkTargets(query: string): Promise<NetworkLinkTarget[]> {
  await requireUserOrThrow();
  return searchLinkTargets(z.string().max(200).catch("").parse(query));
}
