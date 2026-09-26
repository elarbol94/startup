"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { calendarEvents } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { requireCalendarEditor } from "@/modules/calendar/event-action-helpers";
import { projectLinkTargetTypes, type ProjectLinkTargetType } from "./schema";
import {
  linkedProjects,
  listProjectRefs,
  projectLinkTargetLabel,
  syncProjectLinks,
} from "./project-link-refs";

const targetSchema = z.object({
  targetType: z.enum(projectLinkTargetTypes),
  targetId: z.string().min(1).max(200),
});

const saveSchema = targetSchema.extend({
  projectIds: z.array(z.string().min(1).max(200)).max(20),
});

function eventCalendarId(eventId: string) {
  const event = db
    .select({ calendarId: calendarEvents.calendarId })
    .from(calendarEvents)
    .where(eq(calendarEvents.id, eventId))
    .get();
  if (!event) throw new Error("Link target not found");
  return event.calendarId;
}

function assertCanAccess(targetType: ProjectLinkTargetType, targetId: string, userId: string) {
  if (targetType === "calendarEvent") {
    // Only people who can edit the event see and change its tags.
    requireCalendarEditor(eventCalendarId(targetId), userId);
    return;
  }
  if (projectLinkTargetLabel(targetType, targetId) === null) throw new Error("Link target not found");
}

function revalidateTargetPaths(targetType: ProjectLinkTargetType, projectIds: string[]) {
  revalidatePath("/projects", "layout");
  for (const id of new Set(projectIds)) revalidatePath(`/projects/${id}`);
  if (targetType === "calendarEvent") revalidatePath("/calendar");
  else revalidatePath("/accounting", "layout");
}

/** Project picker options: every project, active ones first. */
export async function listProjectLinkOptions() {
  await requireUserOrThrow();
  return listProjectRefs();
}

export async function getProjectLinks(input: z.input<typeof targetSchema>) {
  const currentUser = await requireUserOrThrow();
  const data = targetSchema.parse(input);
  assertCanAccess(data.targetType, data.targetId, currentUser.id);
  return linkedProjects(data.targetType, data.targetId);
}

export async function saveProjectLinks(input: z.input<typeof saveSchema>) {
  const currentUser = await requireUserOrThrow();
  const data = saveSchema.parse(input);
  assertCanAccess(data.targetType, data.targetId, currentUser.id);
  const before = linkedProjects(data.targetType, data.targetId).map((project) => project.id);
  db.transaction((tx) => {
    syncProjectLinks(tx, { ...data, userId: currentUser.id });
  });
  const after = linkedProjects(data.targetType, data.targetId);
  revalidateTargetPaths(data.targetType, [...before, ...after.map((project) => project.id)]);
  return after;
}
