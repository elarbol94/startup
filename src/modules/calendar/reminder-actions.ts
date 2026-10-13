"use server";

// Reminder delivery action: claims due reminders (including recurring occurrences) for the current user.
// Used by components/calendar-client.tsx.
import { requireUserOrThrow } from "@/lib/auth";
import { ensureCalendarWorkspace } from "./queries";
import { claimDueRemindersForUser } from "./reminder-delivery";

export async function claimDueCalendarReminders() {
  const currentUser = await requireUserOrThrow();
  ensureCalendarWorkspace(currentUser.id);
  return claimDueRemindersForUser(currentUser.id);
}
