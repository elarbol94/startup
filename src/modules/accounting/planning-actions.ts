"use server";

import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { budgetPlans, categories } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";

const planningSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  amounts: z
    .array(
      z.object({
        categoryId: z.string().min(1),
        month: z.number().int().min(1).max(12),
        amountCents: z.number().int().min(0).max(100_000_000_000),
      }),
    )
    .max(12_000),
});

export type PlanningInput = z.infer<typeof planningSchema>;

/** Saves the supplied planning cells without disturbing categories not shown in the UI. */
export async function savePlanning(input: PlanningInput) {
  await requireUserOrThrow();
  const data = planningSchema.parse(input);
  const categoryIds = [...new Set(data.amounts.map((amount) => amount.categoryId))];
  const existingIds =
    categoryIds.length === 0
      ? []
      : db
          .select({ id: categories.id })
          .from(categories)
          .where(inArray(categories.id, categoryIds))
          .all()
          .map((row) => row.id);
  if (existingIds.length !== categoryIds.length) throw new Error("Unknown category");

  db.transaction((tx) => {
    for (const amount of data.amounts) {
      if (amount.amountCents === 0) {
        tx.delete(budgetPlans)
          .where(
            and(
              eq(budgetPlans.categoryId, amount.categoryId),
              eq(budgetPlans.year, data.year),
              eq(budgetPlans.month, amount.month),
            ),
          )
          .run();
        continue;
      }
      tx.insert(budgetPlans)
        .values({
          categoryId: amount.categoryId,
          year: data.year,
          month: amount.month,
          amountCents: amount.amountCents,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [budgetPlans.categoryId, budgetPlans.year, budgetPlans.month],
          set: { amountCents: amount.amountCents, updatedAt: new Date() },
        })
        .run();
    }
  });

  revalidatePath("/accounting/planning");
}
