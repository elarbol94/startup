import "server-only";
import fs from "node:fs/promises";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { attachments, wikiFigureAssets, wikiFigureRevisions } from "@/db/schema";
import { getAttachmentAbsolutePath } from "@/lib/files";

/**
 * Stored figure artwork of an old-editor page. Read by the Word conversion and
 * the read-only HTML of the text before conversion; nothing writes figures any more.
 */
export async function figureRevisionBytes(pageId: string, assetId: string, version?: number) {
  const asset = db.select().from(wikiFigureAssets).where(and(eq(wikiFigureAssets.id, assetId), eq(wikiFigureAssets.pageId, pageId))).get();
  if (!asset) throw new Error("notFound");
  const revision = db.select().from(wikiFigureRevisions).where(and(eq(wikiFigureRevisions.assetId, assetId), eq(wikiFigureRevisions.version, version ?? asset.version))).get();
  if (!revision) throw new Error("notFound");
  const attachment = db.select().from(attachments).where(eq(attachments.id, revision.attachmentId)).get();
  if (!attachment || attachment.entityId !== pageId) throw new Error("notFound");
  const bytes = await fs.readFile(getAttachmentAbsolutePath(attachment.storedName));
  return { bytes, mimeType: attachment.mimeType, fileName: attachment.fileName };
}
