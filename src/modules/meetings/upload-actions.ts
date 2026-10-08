"use server";

import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { fail, revalidateMeeting, type MeetingActionResult } from "./action-helpers";
import { meetingFor } from "./access";
import { audit } from "./processing/store";
import { mediaUploadSessions } from "./schema";

const dismissSchema = z.object({ uploadId: z.string().min(1).max(64) });

/** Hides a failed upload from the meeting page; the uploader or a host may do so. */
export async function dismissFailedUpload(input: z.input<typeof dismissSchema>): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = dismissSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const upload = db.select().from(mediaUploadSessions).where(eq(mediaUploadSessions.id, parsed.data.uploadId)).get();
  if (!upload) return fail("notFound");
  const access = meetingFor(upload.meetingId, viewer, "view");
  if (!access.ok) return fail(access.error);
  if (upload.userId !== viewer.id && access.role !== "host") return fail("forbidden");
  if (upload.state !== "aborted") return fail("stale");
  const changed = db.update(mediaUploadSessions).set({ dismissedAt: new Date() })
    .where(and(eq(mediaUploadSessions.id, upload.id), eq(mediaUploadSessions.state, "aborted"), isNull(mediaUploadSessions.dismissedAt))).run().changes;
  if (changed) audit(db, upload.meetingId, viewer.id, "upload.dismissed", { uploadId: upload.id });
  revalidateMeeting(upload.meetingId);
  return { ok: true };
}
