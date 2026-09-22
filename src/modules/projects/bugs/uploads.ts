import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { attachments, tasks } from "@/db/schema";
import { saveAttachmentBuffer, UploadError } from "@/lib/files";
import { bugReports, bugReportUploads } from "./schema";

export function isBugReport(taskId: string) {
  return !!db.select({ id: bugReports.taskId }).from(bugReports).where(eq(bugReports.taskId, taskId)).get();
}

export async function saveBugScreenshot(file: File, taskId: string, userId: string, uploadId: unknown) {
  if (!z.string().uuid().safeParse(uploadId).success) throw new UploadError("Invalid upload identifier");
  if (!file.size || file.size > 10 * 1024 * 1024 || !["image/png", "image/jpeg", "image/webp"].includes(file.type)) throw new UploadError("Use PNG, JPEG or WebP screenshots up to 10 MB");
  const buffer = Buffer.from(await file.arrayBuffer());
  const valid = file.type === "image/png" ? buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : file.type === "image/jpeg" ? buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255
    : buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP";
  if (!valid) throw new UploadError("Invalid screenshot content");
  return db.transaction(() => {
    const task = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!task || !isBugReport(taskId) || task.createdBy !== userId) throw new UploadError("Only the reporter can upload screenshots");
    const existing = db.select({ attachment: attachments }).from(bugReportUploads).innerJoin(attachments, eq(attachments.id, bugReportUploads.attachmentId))
      .where(and(eq(bugReportUploads.taskId, taskId), eq(bugReportUploads.uploadId, uploadId as string))).get();
    if (existing) return existing.attachment;
    if (db.select({ id: attachments.id }).from(attachments).where(and(eq(attachments.entityType, "task"), eq(attachments.entityId, taskId))).all().length >= 5) throw new UploadError("Maximum five screenshots");
    const attachment = saveAttachmentBuffer({ file, buffer, entityType: "task", entityId: taskId, userId });
    db.insert(bugReportUploads).values({ taskId, uploadId: uploadId as string, attachmentId: attachment.id }).run();
    return attachment;
  }, { behavior: "immediate" });
}
