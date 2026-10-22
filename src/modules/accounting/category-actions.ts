"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { categories } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { categoryUsageCount } from "./queries";

// --- Categories (admin only) ---

const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  kind: z.enum(["income", "expense"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default("#64748b"),
  template: z.enum([
    "standard_income",
    "grant_income",
    "standard_expense",
    "hospitality",
    "travel",
    "vehicle",
    "asset",
    "personnel",
    "svs",
    "tax_levy",
  ]).optional(),
});

export type CategoryInput = z.infer<typeof categorySchema>;

export async function upsertCategory(input: CategoryInput) {
  await requireAdmin();
  const data = categorySchema.parse(input);

  if (data.id) {
    db.update(categories)
      .set({
        name: data.name,
        color: data.color,
        ...(data.template ? { template: data.template } : {}),
      })
      .where(eq(categories.id, data.id))
      .run();
  } else {
    db.insert(categories)
      .values({
        name: data.name,
        kind: data.kind,
        color: data.color,
        template:
          data.template ??
          (data.kind === "income" ? "standard_income" : "standard_expense"),
      })
      .run();
  }
  revalidatePath("/settings/categories");
  revalidatePath("/accounting");
  revalidatePath("/accounting/bookings");
  revalidatePath("/documents");
  revalidatePath("/accounting/planning");
}

export async function setCategoryArchived(id: string, archived: boolean) {
  await requireAdmin();
  db.update(categories).set({ archived }).where(eq(categories.id, id)).run();
  revalidatePath("/settings/categories");
  revalidatePath("/accounting");
  revalidatePath("/accounting/bookings");
  revalidatePath("/documents");
  revalidatePath("/accounting/planning");
}

/** Deletes a category only when no entries reference it; archive otherwise. */
export async function deleteCategory(id: string): Promise<{ deleted: boolean }> {
  await requireAdmin();
  if (categoryUsageCount(id) > 0) return { deleted: false };
  db.delete(categories).where(eq(categories.id, id)).run();
  revalidatePath("/settings/categories");
  revalidatePath("/accounting");
  revalidatePath("/accounting/bookings");
  revalidatePath("/accounting/planning");
  revalidatePath("/documents");
  return { deleted: true };
}
