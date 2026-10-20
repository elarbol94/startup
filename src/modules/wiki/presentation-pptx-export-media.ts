import { presentationMedia } from "./lib/presentation-media";
import fs from "node:fs/promises";
import { getAttachment, getAttachmentAbsolutePath } from "@/lib/files";
import type { PresentationSnapshot } from "./lib/presentation";
import type { PptxExportMedia } from "./lib/presentation-pptx-export";

const MAX_EXPORT_MEDIA_BYTES = 100 * 1024 * 1024;

/**
 * Image bytes for the .pptx export, read through the attachment store like the offline
 * export. Missing attachments are left out; the exporter turns them into placeholders.
 */
export async function pptxExportMedia(snapshot: PresentationSnapshot): Promise<PptxExportMedia> {
  const media: PptxExportMedia = {};
  let total = 0;
  for (const id of new Set(presentationMedia(snapshot.elements).filter((ref) => ref.kind === "image").map((ref) => ref.attachmentId))) {
    const row = getAttachment(id);
    if (!row || !row.mimeType.startsWith("image/")) continue;
    total += row.sizeBytes;
    if (total > MAX_EXPORT_MEDIA_BYTES) throw new Error("Export media exceeds 100 MB");
    media[id] = { mime: row.mimeType, bytes: new Uint8Array(await fs.readFile(getAttachmentAbsolutePath(row.storedName))) };
  }
  return media;
}
