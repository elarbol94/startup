import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pushPreferences } from "./schema";

export type PushPreferences = { activity: boolean; calendar: boolean; tasksDue: boolean };

export function getPushPreferences(userId: string): PushPreferences {
  const row = db.select().from(pushPreferences).where(eq(pushPreferences.userId, userId)).get();
  return { activity: row?.activity ?? true, calendar: row?.calendar ?? true, tasksDue: row?.tasksDue ?? true };
}
