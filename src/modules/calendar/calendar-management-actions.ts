"use server";

// Calendar management actions: creating, editing and sharing calendars.
// Used by components/calendar-client.tsx.
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { calendarMemberships, calendars } from "./schema";
import { calendarRoleForUser } from "./queries";

export async function createCalendar(input: {
  name: string;
  color: string;
  visibility: "private" | "busy" | "company";
}) {
  const currentUser = await requireUserOrThrow();
  const data = z
    .object({
      name: z.string().trim().min(1).max(120),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      visibility: z.enum(["private", "busy", "company"]),
    })
    .parse(input);
  const calendar = db
    .insert(calendars)
    .values({ ...data, ownerId: currentUser.id })
    .returning()
    .get();
  db.insert(calendarMemberships)
    .values({ calendarId: calendar.id, userId: currentUser.id, role: "owner" })
    .run();
  revalidatePath("/calendar");
  return calendar.id;
}

export async function updateCalendar(input: {
  calendarId: string;
  name: string;
  color: string;
  visibility: "private" | "busy" | "company";
}) {
  const currentUser = await requireUserOrThrow();
  const data = z
    .object({
      calendarId: z.string().min(1),
      name: z.string().trim().min(1).max(120),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      visibility: z.enum(["private", "busy", "company"]),
    })
    .parse(input);
  if (calendarRoleForUser(data.calendarId, currentUser.id) !== "owner") {
    throw new Error("Only the owner can edit this calendar");
  }
  db.update(calendars)
    .set({ name: data.name, color: data.color, visibility: data.visibility, updatedAt: new Date() })
    .where(eq(calendars.id, data.calendarId))
    .run();
  revalidatePath("/calendar");
}
