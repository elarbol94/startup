"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { convertPageToOffice } from "./convert-page";

/** Admin: converts one TipTap document page to a Word (office) document. */
export async function convertDocumentToOffice(input: { pageId: string }) {
  const admin = await requireAdmin();
  const { pageId } = z.object({ pageId: z.string().min(1).max(64) }).parse(input);
  const origin = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").origin;
  const result = await convertPageToOffice(pageId, admin.id, origin);
  if (result.ok) {
    revalidatePath("/settings/documents");
    revalidatePath("/wiki", "layout");
  }
  return result.ok
    ? { ok: true as const }
    : { ok: false as const, reason: result.reason, issues: result.issues.map((issue) => `${issue.code}: ${issue.detail}`), message: result.message ?? null };
}
