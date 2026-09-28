import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { attachments, attachmentEntityTypes } from "@/db/schema";
import { isSafeInlineSvg } from "@/lib/svg-upload";

export const UPLOADS_PATH =
  process.env.UPLOADS_PATH ??
  path.join(/* turbopackIgnore: true */ process.cwd(), "data", "uploads");

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50 MB
// Caps gunzip's output so a small, highly-compressed .svgz cannot force an unbounded allocation (decompression bomb).
const MAX_SVG_DECOMPRESSED_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_MIME: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
  "image/heic": ".heic",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/ogg": ".ogg",
  "audio/wav": ".wav",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/csv": ".csv",
  "text/tab-separated-values": ".tsv",
};

export type AttachmentEntityType = (typeof attachmentEntityTypes)[number];

export function isAttachmentEntityType(
  value: string,
): value is AttachmentEntityType {
  return (attachmentEntityTypes as readonly string[]).includes(value);
}

export class UploadError extends Error {}

export async function saveAttachment(options: {
  file: File;
  entityType: AttachmentEntityType;
  entityId: string;
  userId: string;
}) {
  if (options.file.size > MAX_UPLOAD_BYTES) throw new UploadError("File exceeds the 50 MB limit");
  const buffer = Buffer.from(await options.file.arrayBuffer());
  return saveAttachmentBuffer({ ...options, buffer });
}

/** Synchronous persistence for callers that must atomically link an attachment. */
export function saveAttachmentBuffer(options: {
  file: File; entityType: AttachmentEntityType; entityId: string; userId: string; buffer: Buffer;
}) {
  const staged = stageAttachmentBuffer({ buffer: options.buffer, fileName: options.file.name, mimeType: options.file.type, size: options.file.size });
  try {
    return registerStagedAttachment(staged, options);
  } catch (error) {
    discardStagedAttachment(staged);
    throw error;
  }
}

/** Server-only formats that may be stored but never uploaded through /api/files. */
const INTERNAL_MIME: Record<string, string> = { "application/zip": ".zip" };

export type StagedAttachment = {
  storedName: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string;
};

/**
 * Validates and writes an immutable file with a unique name, without a
 * database row. Pair with `registerStagedAttachment` inside the caller's
 * transaction, and `discardStagedAttachment` if that transaction fails; the
 * unique name means a discard never removes bytes another row references.
 */
export function stageAttachmentBuffer(options: {
  buffer: Buffer; fileName: string; mimeType: string; size?: number; internal?: boolean;
}): StagedAttachment {
  const { buffer, fileName, mimeType: type } = options;
  const size = options.size ?? buffer.byteLength;
  const ext = type === "image/svg+xml" && /\.svgz$/i.test(fileName)
    ? ".svgz"
    : ALLOWED_MIME[type] ?? (options.internal ? INTERNAL_MIME[type] : undefined);
  if (!ext) throw new UploadError(`File type not allowed: ${type}`);
  if (size > MAX_UPLOAD_BYTES) {
    throw new UploadError("File exceeds the 50 MB limit");
  }

  // Media is served inline: reject disguised HTML and unsupported containers.
  if (/^(audio|video)\//.test(type)) {
    const header = buffer.subarray(0, 16);
    const valid = type.endsWith("mp4") ? header.subarray(4, 8).toString() === "ftyp"
      : type === "video/webm" ? header.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      : type === "audio/ogg" ? header.subarray(0, 4).toString() === "OggS"
      : type === "audio/wav" ? header.subarray(0, 4).toString() === "RIFF" && header.subarray(8, 12).toString() === "WAVE"
      : type === "audio/mpeg" ? header.subarray(0, 3).toString() === "ID3" || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0) : false;
    if (!valid) throw new UploadError("The media content does not match its file type");
  }
  if (type === "image/svg+xml") {
    let svgBytes: Uint8Array = buffer;
    try {
      if (ext === ".svgz" || (buffer[0] === 0x1f && buffer[1] === 0x8b)) svgBytes = gunzipSync(buffer, { maxOutputLength: MAX_SVG_DECOMPRESSED_BYTES });
    } catch {
      throw new UploadError("SVGZ could not be decompressed, or exceeds the size limit once unpacked");
    }
    if (!isSafeInlineSvg(svgBytes)) throw new UploadError("SVG contains active or externally loaded content");
  }
  const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
  // Shard by hash prefix so a single directory never grows unbounded.
  const storedName = `${sha256.slice(0, 2)}/${crypto.randomUUID()}${ext}`;

  const absolute = path.join(/* turbopackIgnore: true */ UPLOADS_PATH, storedName);
  fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(absolute), { recursive: true });
  fs.writeFileSync(/* turbopackIgnore: true */ absolute, buffer, { flag: "wx" });
  return { storedName, fileName, mimeType: type, sizeBytes: size, sha256 };
}

/** Inserts the row for a staged file; run inside the caller's transaction. */
export function registerStagedAttachment(staged: StagedAttachment, owner: {
  entityType: AttachmentEntityType; entityId: string; userId: string;
}) {
  return db
    .insert(attachments)
    .values({
      fileName: staged.fileName,
      storedName: staged.storedName,
      mimeType: staged.mimeType,
      sizeBytes: staged.sizeBytes,
      sha256: staged.sha256,
      entityType: owner.entityType,
      entityId: owner.entityId,
      uploadedBy: owner.userId,
    })
    .returning()
    .get();
}

/** Removes only the file this operation staged. */
export function discardStagedAttachment(staged: StagedAttachment) {
  fs.rmSync(/* turbopackIgnore: true */ path.join(UPLOADS_PATH, staged.storedName), { force: true });
}

export function getAttachment(id: string) {
  return db.select().from(attachments).where(eq(attachments.id, id)).get();
}

export function getAttachmentAbsolutePath(storedName: string) {
  return path.join(/* turbopackIgnore: true */ UPLOADS_PATH, storedName);
}

export function listAttachmentsFor(
  entityType: AttachmentEntityType,
  entityId: string,
) {
  return db
    .select()
    .from(attachments)
    .where(
      and(
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
      ),
    )
    .all();
}

/** Preserve immutable bytes inside the existing upload store before deletion/overwrite. */
export function retainAttachmentVersion(row: { storedName: string; sha256: string }) {
  if (!/^[a-f0-9]{64}$/.test(row.sha256)) throw new UploadError("Invalid attachment digest");
  const absolute = getAttachmentAbsolutePath(row.storedName);
  if (!fs.existsSync(/* turbopackIgnore: true */ absolute)) return;
  const directory = path.join(/* turbopackIgnore: true */ UPLOADS_PATH, ".history");
  fs.mkdirSync(/* turbopackIgnore: true */ directory, { recursive: true });
  const destination = path.join(/* turbopackIgnore: true */ directory, row.sha256);
  if (!fs.existsSync(/* turbopackIgnore: true */ destination)) {
    const bytes = fs.readFileSync(/* turbopackIgnore: true */ absolute);
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== row.sha256) throw new UploadError("Attachment content does not match its digest");
    fs.writeFileSync(/* turbopackIgnore: true */ destination, bytes, { flag: "wx" });
  }
}

/** Return verified historical bytes through the existing attachment path convention. */
export function recoverAttachmentVersion(storedName: string, sha256: string) {
  if (!/^[a-f0-9]{64}$/.test(sha256) || path.isAbsolute(storedName) || storedName.split(/[\\/]/).includes("..")) return null;
  for (const candidate of [getAttachmentAbsolutePath(storedName), path.join(/* turbopackIgnore: true */ UPLOADS_PATH, ".history", sha256)]) {
    if (!fs.existsSync(/* turbopackIgnore: true */ candidate)) continue;
    const bytes = fs.readFileSync(/* turbopackIgnore: true */ candidate);
    if (crypto.createHash("sha256").update(bytes).digest("hex") !== sha256) continue;
    if (candidate === getAttachmentAbsolutePath(storedName)) return storedName;
    const recoveredName = `${sha256.slice(0, 2)}/${crypto.randomUUID()}${path.extname(storedName)}`;
    const destination = getAttachmentAbsolutePath(recoveredName);
    fs.mkdirSync(/* turbopackIgnore: true */ path.dirname(/* turbopackIgnore: true */ destination), { recursive: true });
    fs.writeFileSync(/* turbopackIgnore: true */ destination, bytes, { flag: "wx" });
    return recoveredName;
  }
  return null;
}

export function deleteAttachment(id: string) {
  const row = getAttachment(id);
  if (!row) return;
  retainAttachmentVersion(row);
  db.delete(attachments).where(eq(attachments.id, id)).run();
  const absolute = getAttachmentAbsolutePath(row.storedName);
  if (fs.existsSync(/* turbopackIgnore: true */ absolute)) fs.unlinkSync(/* turbopackIgnore: true */ absolute);
}

/** Removes active rows/files; immutable recovery bytes remain in the upload store. */
export function deleteAttachmentsFor(
  entityType: AttachmentEntityType,
  entityId: string,
) {
  for (const row of listAttachmentsFor(entityType, entityId)) {
    deleteAttachment(row.id);
  }
}
