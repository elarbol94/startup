"use server";

import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { fail, revalidateNetwork, type NetworkActionResult } from "./action-helpers";
import { mergeNoteDate } from "./merge-note-date";
import {
  mergeOrganizationsSchema,
  organizationMergePairSchema,
  type MergeOrganizationsInput,
  type NetworkOrganizationMergePreview,
} from "./organization-merge-fields";
import { applyOrganizationMerge, loadOrganizationPair, organizationMergePreview, planOrganizationMerge } from "./organization-merge";
import { canViewOrganization } from "./organization-queries";
import { networkOrganizations } from "./schema";

/**
 * What merging organisation `mergeId` into `keepId` would move. Admin only:
 * organisations are shared and their references include other users' private
 * contacts, so the preview gives counts, never names of contacts.
 */
export async function getNetworkOrganizationMergePreview(input: { keepId: string; mergeId: string }): Promise<NetworkActionResult<{ preview: NetworkOrganizationMergePreview }>> {
  await requireAdmin();
  const parsed = organizationMergePairSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const pair = loadOrganizationPair(db, parsed.data.keepId, parsed.data.mergeId);
  if (!pair.ok) return pair;
  const t = await getTranslations("network");
  const mergedOn = await mergeNoteDate();
  return { ok: true, preview: organizationMergePreview(pair.keep, pair.merge, t, mergedOn) };
}

/**
 * Merges two organisations that are the same: every contact and lead naming
 * `mergeId` moves to `keepId`, including other users' private contacts (their
 * owners and visibility stay as they are), the chosen values are applied, the
 * notes combined, and `mergeId` is deleted. Admin only; one transaction.
 * `visible` says whether the admin can open the surviving organisation afterwards.
 */
export async function mergeNetworkOrganizations(input: MergeOrganizationsInput): Promise<NetworkActionResult<{ organizationId: string; visible: boolean }>> {
  const admin = await requireAdmin();
  const parsed = mergeOrganizationsSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { keepId, mergeId, choices } = parsed.data;
  const t = await getTranslations("network");
  const mergedOn = await mergeNoteDate();

  const result = db.transaction((tx) => {
    const pair = loadOrganizationPair(tx, keepId, mergeId);
    if (!pair.ok) return pair;
    const plan = planOrganizationMerge(pair.keep, pair.merge, choices, t, mergedOn);
    if (plan.blockers.length) return fail(plan.blockers[0]);
    applyOrganizationMerge(tx, keepId, mergeId, plan.values);
    return { ok: true as const };
  });
  if (!result.ok) return result;

  revalidateNetwork();
  const kept = db.select().from(networkOrganizations).where(eq(networkOrganizations.id, keepId)).get();
  return { ok: true, organizationId: keepId, visible: Boolean(kept && canViewOrganization(admin, kept)) };
}
