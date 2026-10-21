"use server";

import { z } from "zod";
import { db } from "@/db";
import { userProfilePreferences } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireUserOrThrow } from "@/lib/auth";
import { ensureUserMarkColor } from "@/lib/user-mark-colors.server";
import { moduleNavGroups, type ModuleNavGroup } from "@/modules/registry";
import { parseGroupLayout, type SidebarGroupLayout } from "./sidebar-model";

const groupSchema = z.enum(moduleNavGroups as [ModuleNavGroup, ...ModuleNavGroup[]]);
const layoutSchema = z.object({
  order: z.array(groupSchema).max(moduleNavGroups.length),
  collapsed: z.array(groupSchema).max(moduleNavGroups.length),
});

/** Saves the signed-in user's sidebar group order and collapsed groups; the sidebar is in the layout, so nothing is revalidated. */
export async function saveSidebarGroupLayout(input: SidebarGroupLayout) {
  const currentUser = await requireUserOrThrow();
  const layout = parseGroupLayout(JSON.stringify(layoutSchema.parse(input)));
  ensureUserMarkColor(currentUser.id);
  db.update(userProfilePreferences)
    .set({ sidebarLayoutJson: JSON.stringify(layout), updatedAt: new Date() })
    .where(eq(userProfilePreferences.userId, currentUser.id))
    .run();
  return { ok: true as const };
}
