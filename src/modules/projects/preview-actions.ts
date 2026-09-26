"use server";

import { z } from "zod";
import { requireUserOrThrow } from "@/lib/auth";
import { todayInVienna } from "@/modules/time/queries";
import { getProjectPreview } from "./pulse";

/** Hover-card data for a project chip. */
export async function loadProjectPreview(projectId: string) {
  await requireUserOrThrow();
  return getProjectPreview(z.string().min(1).max(200).parse(projectId), todayInVienna());
}
