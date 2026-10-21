import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userProfilePreferences } from "@/db/schema";
import { parseGroupLayout, type SidebarGroupLayout } from "./sidebar-model";

/** The saved sidebar group layout; read in the layout so the first paint already matches it. */
export function getSidebarGroupLayoutForUser(userId: string): SidebarGroupLayout {
  const stored = db.select({ value: userProfilePreferences.sidebarLayoutJson })
    .from(userProfilePreferences)
    .where(eq(userProfilePreferences.userId, userId))
    .get();
  return parseGroupLayout(stored?.value);
}
