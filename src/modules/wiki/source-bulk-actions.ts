"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { bulkIdsSchema, bulkOutcome, type BulkOutcome } from "@/lib/bulk";
import { softDeleteSource } from "./page-trash";

const deleteSchema = z.object({ ids: bulkIdsSchema });

/** Moves sources to the trash in one transaction; unknown or already trashed ids are skipped. */
export async function deleteSources(input: z.input<typeof deleteSchema>): Promise<BulkOutcome> {
  const user = await requireUserOrThrow();
  const data = deleteSchema.parse(input);
  const trashed = db.transaction(() => data.ids.filter((id) => softDeleteSource(id, user.id)));
  revalidatePath("/wiki", "layout");
  return bulkOutcome(trashed, data.ids.filter((id) => !trashed.includes(id)).map((id) => ({ id, reason: "notFound" as const })));
}
