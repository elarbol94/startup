"use server";

import { z } from "zod";
import { inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { wikiPresentations } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { deleteAttachmentsFor } from "@/lib/files";
import { bulkIdsSchema, bulkOutcome, type BulkOutcome } from "@/lib/bulk";
import { presentationRole } from "./presentation-access";

const deleteSchema = z.object({ ids: bulkIdsSchema });

/** Permanently deletes presentations the caller owns (admins own all); others are skipped. */
export async function deletePresentations(input: z.input<typeof deleteSchema>): Promise<BulkOutcome> {
  const currentUser = await requireUserOrThrow();
  const data = deleteSchema.parse(input);
  const skipped: BulkOutcome["skipped"] = [];
  const allowed: string[] = [];
  for (const id of data.ids) {
    const role = presentationRole(id, currentUser);
    if (role === "owner") allowed.push(id);
    else skipped.push({ id, reason: role ? "forbidden" : "notFound" });
  }
  if (allowed.length) db.transaction(() => { db.delete(wikiPresentations).where(inArray(wikiPresentations.id, allowed)).run(); });
  // The canvases are gone, so their uploaded images are unreachable — remove them too.
  for (const id of allowed) deleteAttachmentsFor("wikiPresentation", id);
  revalidatePath("/wiki/presentations");
  for (const id of allowed) revalidatePath(`/wiki/presentations/${id}`);
  return bulkOutcome(allowed, skipped);
}
