"use server";

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { fail, revalidateNetwork, type NetworkActionResult } from "./action-helpers";
import { normalizeText } from "./network-utils";
import { canViewOrganization } from "./organization-queries";
import { networkContacts, networkLeads, networkOrganizations } from "./schema";
import { idSchema } from "./validation";

const organizationSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(160),
  // http(s) only: the value is rendered as a link.
  website: z.union([z.literal(""), z.string().trim().max(500).url().regex(/^https?:\/\//i)]).default(""),
  notes: z.string().trim().max(20_000).default(""),
});

/** Organisations are shared: anyone who can see one may correct its name, website and notes. */
export async function updateNetworkOrganization(input: z.input<typeof organizationSchema>): Promise<NetworkActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = organizationSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { id, name, website, notes } = parsed.data;
  const organization = db.select().from(networkOrganizations).where(eq(networkOrganizations.id, id)).get();
  if (!organization || !canViewOrganization(viewer, organization)) return fail("notFound");
  const normalizedName = normalizeText(name);
  const clash = db
    .select({ id: networkOrganizations.id })
    .from(networkOrganizations)
    .where(and(eq(networkOrganizations.normalizedName, normalizedName), ne(networkOrganizations.id, id)))
    .get();
  if (clash) return fail("duplicate");

  db.transaction((tx) => {
    tx.update(networkOrganizations).set({ name, normalizedName, website, notes, updatedAt: new Date() }).where(eq(networkOrganizations.id, id)).run();
    // The display name is copied onto contacts and leads; keep them in step.
    tx.update(networkContacts).set({ organization: name }).where(eq(networkContacts.organizationId, id)).run();
    tx.update(networkLeads).set({ targetOrganization: name }).where(eq(networkLeads.targetOrganizationId, id)).run();
  });
  revalidateNetwork();
  return { ok: true };
}
