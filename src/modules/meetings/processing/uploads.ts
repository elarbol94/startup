import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable, Transform } from "node:stream";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { getAttachmentAbsolutePath, mediaHeaderMatches, moveStagedFileIntoStore, newStoredName, registerStagedAttachment, UPLOADS_PATH } from "@/lib/files";
import { MEDIA_CHUNK_BYTES, MEETING_MEDIA_TYPES, UPLOAD_DECLARATION_VERSION } from "../constants";
import { mediaUploadSessions, meetingRecordings, meetings } from "../schema";
import { enqueueJob } from "./jobs";
import { audit, retentionExpiry, UPLOAD_STAGING } from "./store";

export type UploadSession = typeof mediaUploadSessions.$inferSelect;
export type UploadError = "invalid" | "notFound" | "forbidden" | "tooLarge" | "type" | "declaration" | "quota" | "disk" | "state" | "chunk";

const GB = 1024 ** 3;
export const MAX_RECORDING_BYTES = Math.max(1, Number(process.env.MEETINGS_MAX_UPLOAD_BYTES || 4 * GB));
const USER_QUOTA_BYTES = Math.max(MAX_RECORDING_BYTES * 2, Number(process.env.MEETINGS_USER_RESERVATION_BYTES || 8 * GB));
const DISK_HEADROOM_BYTES = Number(process.env.MEETINGS_DISK_HEADROOM_BYTES || 2 * GB);
const UPLOAD_TTL_MS = 24 * 60 * 60_000;
/** An assembly not finished after this long is assumed to have crashed. */
const STALE_ASSEMBLY_MS = 30 * 60_000;

const ACTIVE_STATES = ["uploading", "assembling", "finalizing"] as const;
const sessionDir = (id: string) => path.join(UPLOAD_STAGING, id);
const chunkPath = (id: string, index: number) => path.join(sessionDir(id), `${index}.part`);
const assembledPath = (id: string) => path.join(sessionDir(id), "assembled");

/** Free bytes on the upload store's filesystem (overridable for tests). */
export let freeDiskBytes = () => {
  fs.mkdirSync(UPLOADS_PATH, { recursive: true });
  const stats = fs.statfsSync(UPLOADS_PATH);
  return Number(stats.bavail) * Number(stats.bsize);
};
export function setFreeDiskProbe(probe: () => number) { freeDiskBytes = probe; }

export type UploadDeclaration = { participantsInformed: boolean; aiProcessing: boolean };

/**
 * Starts an upload. Authorization, type, size, the consent declaration and a
 * disk reservation (chunks + assembled copy) are all checked before a single
 * byte is accepted. The check and the reservation share one SQLite write
 * transaction, so concurrent uploads cannot overbook the disk.
 */
export function createUploadSession(input: {
  meetingId: string; userId: string; fileName: string; mimeType: string; sizeBytes: number; declaration: UploadDeclaration;
}): { ok: true; session: UploadSession } | { ok: false; error: UploadError } {
  if (!MEETING_MEDIA_TYPES[input.mimeType]) return { ok: false, error: "type" };
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0) return { ok: false, error: "invalid" };
  if (input.sizeBytes > MAX_RECORDING_BYTES) return { ok: false, error: "tooLarge" };
  const reservedBytes = input.sizeBytes * 2;
  return db.transaction((tx) => {
    const meeting = tx.select().from(meetings).where(eq(meetings.id, input.meetingId)).get();
    if (!meeting) return { ok: false as const, error: "notFound" as const };
    if (meeting.status === "cancelled") return { ok: false as const, error: "state" as const };
    // Consent: everyone recorded was informed; AI processing is declared too when the meeting uses AI.
    if (!input.declaration.participantsInformed || (meeting.aiPolicy === "openai" && !input.declaration.aiProcessing)) {
      return { ok: false as const, error: "declaration" as const };
    }
    const active = tx.select({
      total: sql<number>`coalesce(sum(${mediaUploadSessions.reservedBytes}), 0)`,
      mine: sql<number>`coalesce(sum(case when ${mediaUploadSessions.userId} = ${input.userId} then ${mediaUploadSessions.reservedBytes} else 0 end), 0)`,
    }).from(mediaUploadSessions).where(inArray(mediaUploadSessions.state, [...ACTIVE_STATES])).get()!;
    if (active.mine + reservedBytes > USER_QUOTA_BYTES) return { ok: false as const, error: "quota" as const };
    if (freeDiskBytes() - active.total < reservedBytes + DISK_HEADROOM_BYTES) return { ok: false as const, error: "disk" as const };
    const session = tx.insert(mediaUploadSessions).values({
      meetingId: input.meetingId,
      userId: input.userId,
      fileName: input.fileName.slice(0, 255) || "recording",
      mimeType: input.mimeType,
      declaredBytes: input.sizeBytes,
      reservedBytes,
      chunkCount: Math.ceil(input.sizeBytes / MEDIA_CHUNK_BYTES),
      consentEvidence: JSON.stringify({
        type: "uploadDeclaration", version: UPLOAD_DECLARATION_VERSION, userId: input.userId, declaredAt: new Date().toISOString(),
        participantsInformed: true, aiProcessing: input.declaration.aiProcessing, aiPolicy: meeting.aiPolicy,
      }),
      expiresAt: new Date(Date.now() + UPLOAD_TTL_MS),
    }).returning().get();
    audit(tx, input.meetingId, input.userId, "upload.started", { uploadId: session.id, sizeBytes: input.sizeBytes, aiProcessing: input.declaration.aiProcessing });
    return { ok: true as const, session };
  }, { behavior: "immediate" });
}

export function loadUploadSession(id: string) {
  return db.select().from(mediaUploadSessions).where(eq(mediaUploadSessions.id, id)).get();
}

export function expectedChunkBytes(session: Pick<UploadSession, "declaredBytes" | "chunkCount">, index: number) {
  return index === session.chunkCount - 1 ? session.declaredBytes - MEDIA_CHUNK_BYTES * (session.chunkCount - 1) : MEDIA_CHUNK_BYTES;
}

/**
 * Streams one chunk to disk, counting the bytes actually received and
 * checking the client's SHA-256 of the chunk. Re-sending a chunk replaces it.
 */
export async function writeUploadChunk(session: UploadSession, index: number, body: ReadableStream<Uint8Array>, sha256: string): Promise<UploadError | null> {
  if (session.state !== "uploading" || session.expiresAt.getTime() < Date.now()) return "state";
  if (!Number.isInteger(index) || index < 0 || index >= session.chunkCount || !/^[a-f0-9]{64}$/.test(sha256)) return "invalid";
  const expected = expectedChunkBytes(session, index);
  fs.mkdirSync(sessionDir(session.id), { recursive: true });
  const temporary = `${chunkPath(session.id, index)}.${crypto.randomUUID()}.tmp`;
  const hash = crypto.createHash("sha256");
  let received = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.byteLength;
      if (received > expected) { callback(new Error("too large")); return; }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body as NodeReadableStream), counter, fs.createWriteStream(temporary, { flags: "wx" }));
  } catch {
    fs.rmSync(temporary, { force: true });
    return "chunk";
  }
  if (received !== expected || hash.digest("hex") !== sha256) {
    fs.rmSync(temporary, { force: true });
    return "chunk";
  }
  fs.renameSync(temporary, chunkPath(session.id, index));
  db.transaction((tx) => {
    const current = tx.select({ received: mediaUploadSessions.receivedChunks }).from(mediaUploadSessions).where(eq(mediaUploadSessions.id, session.id)).get();
    const chunks = new Set<number>(JSON.parse(current?.received ?? "[]"));
    chunks.add(index);
    tx.update(mediaUploadSessions).set({ receivedChunks: JSON.stringify([...chunks].sort((a, b) => a - b)), updatedAt: new Date() })
      .where(eq(mediaUploadSessions.id, session.id)).run();
  }, { behavior: "immediate" });
  return null;
}

/** Marks a complete upload for assembly; the worker assembles it in the background. */
export function requestUploadCompletion(session: UploadSession): UploadError | null {
  if (session.state !== "uploading") return session.state === "aborted" ? "state" : null;
  const received = new Set<number>(JSON.parse(session.receivedChunks));
  if (received.size !== session.chunkCount) return "chunk";
  db.update(mediaUploadSessions).set({ state: "assembling", updatedAt: new Date() })
    .where(and(eq(mediaUploadSessions.id, session.id), eq(mediaUploadSessions.state, "uploading"))).run();
  return null;
}

/**
 * The uploader gave up: frees the reserved space at once instead of after the
 * session expires. Only while chunks are still being sent; assembly is the worker's.
 */
export function cancelUploadSession(session: UploadSession): UploadError | null {
  const changed = db.update(mediaUploadSessions).set({ state: "aborted", error: "", updatedAt: new Date() })
    .where(and(eq(mediaUploadSessions.id, session.id), eq(mediaUploadSessions.state, "uploading"))).run().changes;
  if (!changed) return "state";
  fs.rmSync(sessionDir(session.id), { recursive: true, force: true });
  return null;
}

function abort(session: UploadSession, error: string) {
  db.update(mediaUploadSessions).set({ state: "aborted", error, updatedAt: new Date() }).where(eq(mediaUploadSessions.id, session.id)).run();
  fs.rmSync(sessionDir(session.id), { recursive: true, force: true });
}

/** Concatenates the chunks, hashes the result and checks the media signature. */
async function assemble(session: UploadSession) {
  const target = assembledPath(session.id);
  fs.rmSync(target, { force: true });
  const hash = crypto.createHash("sha256");
  const output = fs.createWriteStream(target, { flags: "wx" });
  for (let index = 0; index < session.chunkCount; index++) {
    await pipeline(fs.createReadStream(chunkPath(session.id, index)), new Transform({
      transform(chunk: Buffer, _encoding, callback) { hash.update(chunk); callback(null, chunk); },
    }), output, { end: index === session.chunkCount - 1 });
  }
  const size = fs.statSync(target).size;
  const header = Buffer.alloc(16);
  const handle = fs.openSync(target, "r");
  try { fs.readSync(handle, header, 0, 16, 0); } finally { fs.closeSync(handle); }
  if (size !== session.declaredBytes) throw new Error("Assembled size does not match");
  if (!mediaHeaderMatches(session.mimeType, header)) return { ok: false as const, error: "The media content does not match its file type" };
  const sha256 = hash.digest("hex");
  // Step 1: remember the stored name before anything moves.
  db.update(mediaUploadSessions).set({ state: "finalizing", sha256, storedName: newStoredName(sha256, MEETING_MEDIA_TYPES[session.mimeType]), updatedAt: new Date() })
    .where(and(eq(mediaUploadSessions.id, session.id), eq(mediaUploadSessions.state, "assembling"))).run();
  for (let index = 0; index < session.chunkCount; index++) fs.rmSync(chunkPath(session.id, index), { force: true });
  return { ok: true as const };
}

/**
 * Steps 2 and 3 of finalisation. Safe to repeat after a crash: the move is
 * skipped when the file is already in the store, and the rows are written
 * only while the session is still `finalizing`.
 */
function finalize(session: UploadSession) {
  if (!session.storedName || !session.sha256) throw new Error("Finalizing upload without a stored name");
  const stored = getAttachmentAbsolutePath(session.storedName);
  if (fs.existsSync(assembledPath(session.id))) moveStagedFileIntoStore(assembledPath(session.id), session.storedName);
  if (!fs.existsSync(stored)) { abort(session, "Assembled file is missing"); return; }
  const registered = db.transaction((tx) => {
    const current = tx.select().from(mediaUploadSessions).where(eq(mediaUploadSessions.id, session.id)).get();
    if (current?.state !== "finalizing") return current?.state === "done";
    const meeting = tx.select().from(meetings).where(eq(meetings.id, session.meetingId)).get();
    if (!meeting) return false;
    const attachment = registerStagedAttachment(
      { storedName: session.storedName!, fileName: session.fileName, mimeType: session.mimeType, sizeBytes: session.declaredBytes, sha256: session.sha256! },
      { entityType: "meetingRecording", entityId: session.meetingId, userId: session.userId },
    );
    const kind = session.mimeType.startsWith("video/") ? "video" as const : "audio" as const;
    const createdAt = new Date();
    // Set now so retention also applies when ingest fails; ingest corrects it from the probed kind.
    const recording = tx.insert(meetingRecordings).values({
      meetingId: session.meetingId, attachmentId: attachment.id, kind,
      speakerScope: "mixed", source: "upload", fileName: session.fileName, sizeBytes: session.declaredBytes, sha256: session.sha256!,
      consentEvidence: session.consentEvidence, createdBy: session.userId, createdAt,
      expiresAt: retentionExpiry(createdAt, kind === "video" ? meeting.videoRetentionDays : meeting.audioRetentionDays),
    }).returning().get();
    tx.update(mediaUploadSessions).set({ state: "done", recordingId: recording.id, updatedAt: new Date() }).where(eq(mediaUploadSessions.id, session.id)).run();
    if (meeting.status === "scheduled" || meeting.status === "review" || meeting.status === "approved") {
      tx.update(meetings).set({ status: "processing", updatedAt: new Date() }).where(eq(meetings.id, meeting.id)).run();
    }
    enqueueJob(tx, {
      meetingId: meeting.id, stage: "ingest", recordingId: recording.id, policyRevision: meeting.policyRevision,
      executionKey: `ingest:${recording.id}`, inputs: [recording.id],
    });
    audit(tx, meeting.id, session.userId, "upload.completed", { uploadId: session.id, recordingId: recording.id, sha256: session.sha256 });
    return true;
  }, { behavior: "immediate" });
  // The meeting was deleted meanwhile: no row will ever point at the moved file.
  if (!registered && !db.select({ id: attachments.id }).from(attachments).where(eq(attachments.storedName, session.storedName)).get()) {
    fs.rmSync(stored, { force: true });
  }
  fs.rmSync(sessionDir(session.id), { recursive: true, force: true });
}

/**
 * Background maintenance for uploads: assembles requested uploads, resumes
 * interrupted assemblies and finalisations, and aborts expired sessions.
 */
export async function processUploadSessions(now = Date.now()) {
  const pending = db.select().from(mediaUploadSessions).where(inArray(mediaUploadSessions.state, [...ACTIVE_STATES])).all();
  for (const session of pending) {
    try {
      if (session.state === "uploading" && session.expiresAt.getTime() < now) abort(session, "Upload expired");
      else if (session.state === "assembling" && (session.updatedAt.getTime() < now - STALE_ASSEMBLY_MS || !fs.existsSync(assembledPath(session.id)))) {
        db.update(mediaUploadSessions).set({ updatedAt: new Date(now) }).where(eq(mediaUploadSessions.id, session.id)).run();
        const result = await assemble(session);
        if (!result.ok) abort(session, result.error);
        else finalize(loadUploadSession(session.id)!);
      } else if (session.state === "finalizing") finalize(session);
    } catch (error) {
      console.error(JSON.stringify({ event: "meeting_upload_failed", uploadId: session.id, error: error instanceof Error ? error.message : String(error) }));
      if (session.expiresAt.getTime() < now) abort(session, "Upload could not be assembled");
    }
  }
  // Staging directories without a live session (e.g. after a manual DB restore).
  if (fs.existsSync(UPLOAD_STAGING)) {
    const live = new Set(pending.map((session) => session.id));
    for (const entry of fs.readdirSync(UPLOAD_STAGING)) {
      if (live.has(entry)) continue;
      const full = path.join(UPLOAD_STAGING, entry);
      if (fs.statSync(full).mtimeMs < now - UPLOAD_TTL_MS) fs.rmSync(full, { recursive: true, force: true });
    }
  }
  db.delete(mediaUploadSessions).where(and(inArray(mediaUploadSessions.state, ["done", "aborted"]), lt(mediaUploadSessions.updatedAt, new Date(now - 30 * UPLOAD_TTL_MS)))).run();
}
