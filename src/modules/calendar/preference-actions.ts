"use server";

// Per-user calendar settings actions: saved views and calendar preferences.
// Used by components/calendar-client.tsx.
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { calendarSavedViews, calendarViews } from "./schema";
import type { CalendarView } from "./types";

export async function saveCalendarView(input: {
  id?: string;
  name: string;
  view: CalendarView;
  filters: {
    sources?: string[];
    people?: string[];
    projects?: string[];
    calendars?: string[];
    query?: string;
  };
  isDefault?: boolean;
}) {
  const currentUser = await requireUserOrThrow();
  const data = z
    .object({
      id: z.string().optional(),
      name: z.string().trim().min(1).max(100),
      view: z.enum(calendarViews),
      filters: z.object({
        sources: z.array(z.string()).optional(),
        people: z.array(z.string()).optional(),
        projects: z.array(z.string()).optional(),
        calendars: z.array(z.string()).optional(),
        query: z.string().max(200).optional(),
      }),
      isDefault: z.boolean().default(false),
    })
    .parse(input);
  if (data.id) {
    const existing = db
      .select({ userId: calendarSavedViews.userId })
      .from(calendarSavedViews)
      .where(eq(calendarSavedViews.id, data.id))
      .get();
    if (existing && existing.userId !== currentUser.id) {
      throw new Error("You cannot edit another user's saved view");
    }
  }
  const id = data.id ?? createId();
  db.transaction((tx) => {
    if (data.isDefault) {
      tx.update(calendarSavedViews)
        .set({ isDefault: false })
        .where(eq(calendarSavedViews.userId, currentUser.id))
        .run();
    }
    tx.insert(calendarSavedViews)
      .values({
        id,
        userId: currentUser.id,
        name: data.name,
        view: data.view,
        filterJson: JSON.stringify(data.filters),
        isDefault: data.isDefault,
      })
      .onConflictDoUpdate({
        target: calendarSavedViews.id,
        set: {
          name: data.name,
          view: data.view,
          filterJson: JSON.stringify(data.filters),
          isDefault: data.isDefault,
          updatedAt: new Date(),
        },
      })
      .run();
  });
  revalidatePath("/calendar");
  return id;
}
