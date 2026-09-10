"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { sqlite } from "@/db";
import { requireAdmin } from "@/lib/auth";
import { previewRestore, restoreVersion, RestoreError } from "./store";
import { restoreHook } from "./restore-hooks";

const selection = z.object({ id: z.number().int().positive(), side: z.enum(["before", "after"]) });
const restoration = selection.extend({ token: z.string().regex(/^[a-f0-9]{64}$/), reason: z.string().trim().min(3).max(500) });

export async function previewPlatformRestore(input: z.infer<typeof selection>) {
  await requireAdmin();
  const data = selection.parse(input);
  return previewRestore(sqlite, data.id, data.side);
}

export async function restorePlatformVersion(input: z.infer<typeof restoration>) {
  const actor = await requireAdmin();
  const data = restoration.parse(input);
  try {
    restoreVersion(sqlite, data, actor.id, restoreHook);
  } catch (error) {
    if (error instanceof RestoreError) return { error: error.code };
    throw error;
  }
  revalidatePath("/", "layout");
  return { error: null };
}
