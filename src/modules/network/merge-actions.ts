"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { localDateInZone } from "@/modules/calendar/date-utils";
import { TIME_ZONE } from "@/modules/time/lib/entry-time";
import { fail, revalidateNetwork, type NetworkActionResult } from "./action-helpers";
import { mergeContactsSchema, mergePairSchema, type MergeContactsInput, type NetworkContactMergePreview } from "./merge-fields";
import { applyMerge, authorizeMerge, mergePreview, planMerge } from "./merge-helpers";

/**
 * What merging `mergeId` into `keepId` would move and which fields conflict.
 * Same authorisation as the merge itself; nothing is returned before it passes.
 */
export async function getNetworkContactMergePreview(input: { keepId: string; mergeId: string }): Promise<NetworkActionResult<{ preview: NetworkContactMergePreview }>> {
  const viewer = await requireUserOrThrow();
  const parsed = mergePairSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const access = authorizeMerge(parsed.data.keepId, parsed.data.mergeId, viewer);
  if (!access.ok) return access;
  const t = await getTranslations("network");
  const today = localDateInZone(new Date(), TIME_ZONE);
  return { ok: true, preview: mergePreview(viewer, access.keep, access.merge, t, today) };
}

/**
 * Merges two contacts that turned out to be the same person: leads,
 * introductions, conversations, links and tags move to `keepId`, the chosen
 * values are applied, values not kept are written into the notes, and
 * `mergeId` is deleted. Everything is re-checked here and runs in one
 * transaction: either all of it happens or nothing does.
 */
export async function mergeNetworkContacts(input: MergeContactsInput): Promise<NetworkActionResult<{ contactId: string }>> {
  const viewer = await requireUserOrThrow();
  const parsed = mergeContactsSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const { keepId, mergeId, choices } = parsed.data;
  const t = await getTranslations("network");
  const today = localDateInZone(new Date(), TIME_ZONE);

  // Authorised and planned inside the transaction, so nothing can change in between.
  const result = db.transaction((tx) => {
    const access = authorizeMerge(keepId, mergeId, viewer);
    if (!access.ok) return access;
    const plan = planMerge(tx, access.keep, access.merge, choices, t, today);
    if (plan.blockers.length) return fail(plan.blockers[0]);
    applyMerge(tx, access.keep, access.merge, plan);
    return { ok: true as const, links: plan.movingLinks };
  });
  if (!result.ok) return result;

  revalidateNetwork();
  // Pages that list linked contacts next to the target.
  for (const link of result.links) {
    if (link.targetType === "project") revalidatePath(`/projects/${link.targetId}`);
    if (link.targetType === "fundingProject") revalidatePath(`/accounting/funding-projects/${link.targetId}`);
  }
  return { ok: true, contactId: keepId };
}
