import "server-only";

import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { getAttachmentAbsolutePath, moveStagedFileIntoStore, STAGING_PATH } from "@/lib/files";
import { meetingAuditLog, meetingRecordings } from "../schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Transaction | typeof db;

export const UPLOAD_STAGING = path.join(STAGING_PATH, "meeting-uploads");
export const DERIVED_STAGING = path.join(STAGING_PATH, "meeting-derived");

/** Staging file of a derived recording; its name follows from the recording id. */
export const derivedStagingPath = (recordingId: string) => path.join(DERIVED_STAGING, `${recordingId}.ogg`);

export function audit(tx: Executor, meetingId: string, actorId: string | null, action: string, details: Record<string, unknown> = {}) {
  tx.insert(meetingAuditLog).values({ meetingId, actorId, action, details: JSON.stringify(details) }).run();
}

/**
 * Absolute path of a recording's stored file. A derived file whose commit
 * succeeded but whose move into the store was interrupted is moved now.
 */
export function recordingFilePath(recordingId: string): string | null {
  const row = db.select({ storedName: attachments.storedName, kind: meetingRecordings.kind })
    .from(meetingRecordings)
    .innerJoin(attachments, eq(attachments.id, meetingRecordings.attachmentId))
    .where(eq(meetingRecordings.id, recordingId)).get();
  if (!row) return null;
  const absolute = getAttachmentAbsolutePath(row.storedName);
  if (!fs.existsSync(absolute) && row.kind === "derived_audio" && fs.existsSync(derivedStagingPath(recordingId))) {
    moveStagedFileIntoStore(derivedStagingPath(recordingId), row.storedName);
  }
  return fs.existsSync(absolute) ? absolute : null;
}

export function retentionExpiry(createdAt: Date, days: number) {
  return new Date(createdAt.getTime() + days * 24 * 60 * 60_000);
}
