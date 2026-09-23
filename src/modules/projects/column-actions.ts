"use server";

import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { projectColumns } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { assertProjectEditable } from "./guards";

const SORT_GAP = 1000;

const moveColumnSchema = z.object({
  columnId: z.string().min(1),
  direction: z.enum(["left", "right"]),
});

/**
 * Moves a board column one slot left or right and renumbers every column of
 * the project with fresh gaps, so duplicate or legacy sort orders heal too.
 */
export async function moveColumn(
  input: z.input<typeof moveColumnSchema>,
): Promise<{ moved: boolean }> {
  await requireUserOrThrow();
  const data = moveColumnSchema.parse(input);
  const column = db
    .select({ projectId: projectColumns.projectId })
    .from(projectColumns)
    .where(eq(projectColumns.id, data.columnId))
    .get();
  if (!column) throw new Error("Column not found");
  assertProjectEditable(column.projectId);

  const moved = db.transaction((tx) => {
    const ordered = tx
      .select({ id: projectColumns.id })
      .from(projectColumns)
      .where(eq(projectColumns.projectId, column.projectId))
      .orderBy(asc(projectColumns.sortOrder), asc(projectColumns.id))
      .all();
    const index = ordered.findIndex((item) => item.id === data.columnId);
    const target = data.direction === "left" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= ordered.length) return false;
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    ordered.forEach((item, position) => {
      tx.update(projectColumns)
        .set({ sortOrder: (position + 1) * SORT_GAP })
        .where(eq(projectColumns.id, item.id))
        .run();
    });
    return true;
  });

  if (moved) {
    revalidatePath(`/projects/${column.projectId}`);
    revalidatePath("/projects");
    revalidatePath("/");
  }
  return { moved };
}
