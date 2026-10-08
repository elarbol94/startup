import "server-only";

import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, lt, notExists, or } from "drizzle-orm";
import { db } from "@/db";
import { attachments } from "@/db/schema";
import { getAttachmentAbsolutePath, purgeMediaAttachment, STAGING_PATH, UPLOADS_PATH } from "@/lib/files";
import { livekitConfig } from "../calls/livekit";
import { mediaUploadSessions, meetingCallSessions, meetingEgressAttempts, meetingJobs, meetingRecordings, meetings } from "../schema";
import { DERIVED_STAGING, derivedStagingPath, UPLOAD_STAGING } from "./store";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const HOUR = 60 * 60_000;
/** Stored files and recorder output younger than this are never touched. */
export const ORPHAN_MIN_AGE_MS = 24 * HOUR;
/** Staging younger than this is never touched, even without a live session. */
export const STAGING_MIN_AGE_MS = 48 * HOUR;
const SWEEP_INTERVAL_MS = 24 * HOUR;

export const CALL_STAGING = path.join(STAGING_PATH, "meeting-calls");
/** Attempts whose recorder output is no longer needed. */
const SETTLED_ATTEMPTS = ["ingested", "failed", "abandoned", "duplicate_stopped"] as const;
/** Recorder output is named `<attempt id>.ogg`; nothing else in that directory is ours. */
const EGRESS_FILE = /^[a-z0-9_-]{1,64}\.ogg$/i;

export type SweepTotals = { files: number; bytes: number };
export type SweepResult = { store: SweepTotals; egress: SweepTotals; staging: SweepTotals };

const empty = (): SweepTotals => ({ files: 0, bytes: 0 });

/** Size and newest modification time of a file, or of a directory and its direct entries. */
function inspect(full: string) {
  const stat = fs.lstatSync(full);
  if (stat.isSymbolicLink()) return null;
  if (!stat.isDirectory()) return { bytes: stat.size, files: 1, mtimeMs: stat.mtimeMs, directory: false };
  let bytes = 0, files = 0, mtimeMs = stat.mtimeMs;
  for (const entry of fs.readdirSync(full)) {
    const child = fs.lstatSync(path.join(full, entry));
    bytes += child.isFile() ? child.size : 0;
    files += 1;
    mtimeMs = Math.max(mtimeMs, child.mtimeMs);
  }
  return { bytes, files, mtimeMs, directory: true };
}

/** Whether `full` lies strictly inside `directory` (no traversal through stored names). */
function inside(directory: string, full: string) {
  const relative = path.relative(directory, full);
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Meeting recording attachments nobody can reach any more: their meeting is
 * gone (a deletion whose unlink failed) or no recording row points at them.
 * Removed with `purgeMediaAttachment`, so no `.history` copy survives.
 */
function sweepStore(now: number, totals: SweepTotals) {
  const orphans = db.select({ id: attachments.id, storedName: attachments.storedName }).from(attachments).where(and(
    eq(attachments.entityType, "meetingRecording"),
    lt(attachments.createdAt, new Date(now - ORPHAN_MIN_AGE_MS)),
    or(
      notExists(db.select({ id: meetings.id }).from(meetings).where(eq(meetings.id, attachments.entityId))),
      notExists(db.select({ id: meetingRecordings.id }).from(meetingRecordings).where(eq(meetingRecordings.attachmentId, attachments.id))),
    ),
  )).all();
  for (const orphan of orphans) {
    const full = getAttachmentAbsolutePath(orphan.storedName);
    if (!inside(UPLOADS_PATH, full) || inside(STAGING_PATH, full)) continue;
    const info = fs.existsSync(full) ? inspect(full) : null;
    if (info?.directory) continue;
    purgeMediaAttachment(orphan.id);
    if (info) { totals.files += 1; totals.bytes += info.bytes; }
  }
}

/** Recorder output older than a day whose attempt is unknown or already settled. */
function sweepEgress(now: number, egressDir: string, totals: SweepTotals) {
  if (!fs.existsSync(egressDir)) return;
  for (const entry of fs.readdirSync(egressDir)) {
    if (!EGRESS_FILE.test(entry)) continue;
    const full = path.join(egressDir, entry);
    const info = inspect(full);
    if (!info || info.directory || info.mtimeMs > now - ORPHAN_MIN_AGE_MS) continue;
    const attempt = db.select({ state: meetingEgressAttempts.state }).from(meetingEgressAttempts).where(eq(meetingEgressAttempts.fileName, entry)).get();
    if (attempt && !(SETTLED_ATTEMPTS as readonly string[]).includes(attempt.state)) continue;
    fs.rmSync(full, { force: true });
    totals.files += 1;
    totals.bytes += info.bytes;
  }
}

/** Whether a staging entry still belongs to work in progress. */
const stagingIsLive: Record<string, (entry: string) => boolean> = {
  [UPLOAD_STAGING]: (entry) => Boolean(db.select({ id: mediaUploadSessions.id }).from(mediaUploadSessions)
    .where(and(eq(mediaUploadSessions.id, entry), inArray(mediaUploadSessions.state, ["uploading", "assembling", "finalizing"]))).get()),
  [DERIVED_STAGING]: (entry) => {
    const id = path.parse(entry).name;
    // A committed recording whose move is pending (recordingFilePath finishes it), or an extraction still running.
    if (db.select({ id: meetingRecordings.id }).from(meetingRecordings).where(eq(meetingRecordings.id, id)).get()) return true;
    const jobId = id.startsWith("drv_") ? id.slice(4) : "";
    return Boolean(jobId && db.select({ id: meetingJobs.id }).from(meetingJobs)
      .where(and(eq(meetingJobs.id, jobId), inArray(meetingJobs.status, ["queued", "running"]))).get());
  },
  [CALL_STAGING]: (entry) => {
    const attempt = db.select({ state: meetingEgressAttempts.state }).from(meetingEgressAttempts).where(eq(meetingEgressAttempts.fileName, entry)).get();
    return Boolean(attempt && !(SETTLED_ATTEMPTS as readonly string[]).includes(attempt.state));
  },
};

/** Meeting staging older than two days that no upload, job or call recording still uses. */
function sweepStaging(now: number, totals: SweepTotals) {
  for (const [directory, isLive] of Object.entries(stagingIsLive)) {
    if (!fs.existsSync(directory)) continue;
    for (const entry of fs.readdirSync(directory)) {
      const full = path.join(directory, entry);
      const info = inspect(full);
      if (!info || info.mtimeMs > now - STAGING_MIN_AGE_MS || isLive(entry)) continue;
      // Only upload sessions are directories; anything else unexpected is left alone.
      if (info.directory !== (directory === UPLOAD_STAGING)) continue;
      fs.rmSync(full, { recursive: info.directory, force: true });
      totals.files += info.files;
      totals.bytes += info.bytes;
    }
  }
}

/**
 * Removes meeting media nothing refers to any more. Conservative by design:
 * it only looks at meeting recording attachments, the recorder's output
 * directory and the three meeting staging directories, and only at entries
 * older than a safety age.
 */
export function sweepOrphanedMedia(options: { now?: number; egressDir?: string } = {}): SweepResult {
  const now = options.now ?? Date.now();
  const result: SweepResult = { store: empty(), egress: empty(), staging: empty() };
  sweepStore(now, result.store);
  // Without calls configured, the recorder directory is not ours to clean.
  const egressDir = options.egressDir ?? (livekitConfig().enabled ? livekitConfig().egressDir : null);
  if (egressDir) sweepEgress(now, egressDir, result.egress);
  sweepStaging(now, result.staging);
  const files = result.store.files + result.egress.files + result.staging.files;
  const bytes = result.store.bytes + result.egress.bytes + result.staging.bytes;
  console.info(JSON.stringify({ event: "meeting_orphan_sweep", files, bytes, ...result }));
  return result;
}

let lastSweep = 0;

/** Daily orphan sweep for the worker's maintenance block; never throws. */
export function runDailyOrphanSweep(now = Date.now()) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  try {
    sweepOrphanedMedia({ now });
  } catch (error) {
    console.error(JSON.stringify({ event: "meeting_orphan_sweep_failed", error: error instanceof Error ? error.message : String(error) }));
  }
}

/** Files a meeting deletion has to remove once its rows are gone. */
export type MeetingFiles = {
  attachmentIds: string[];
  /** Upload sessions and call recordings: stored names not yet registered, and their staging. */
  storedNames: string[];
  uploadIds: string[];
  egressFileNames: string[];
  derivedIds: string[];
};

/** Collects a meeting's files inside the deleting transaction, before its rows go. */
export function collectMeetingFiles(tx: Transaction, meetingId: string): MeetingFiles {
  const attachmentIds = tx.select({ id: attachments.id }).from(attachments)
    .where(and(eq(attachments.entityType, "meetingRecording"), eq(attachments.entityId, meetingId))).all().map((row) => row.id);
  const uploads = tx.select({ id: mediaUploadSessions.id, storedName: mediaUploadSessions.storedName }).from(mediaUploadSessions)
    .where(eq(mediaUploadSessions.meetingId, meetingId)).all();
  const attempts = tx.select({ fileName: meetingEgressAttempts.fileName, storedName: meetingEgressAttempts.storedName }).from(meetingEgressAttempts)
    .innerJoin(meetingCallSessions, eq(meetingCallSessions.id, meetingEgressAttempts.sessionId))
    .where(eq(meetingCallSessions.meetingId, meetingId)).all();
  const extractions = tx.select({ id: meetingJobs.id }).from(meetingJobs)
    .where(and(eq(meetingJobs.meetingId, meetingId), eq(meetingJobs.stage, "extract_audio"))).all();
  return {
    attachmentIds,
    storedNames: [...uploads, ...attempts].map((row) => row.storedName).filter((name): name is string => Boolean(name)),
    uploadIds: uploads.map((row) => row.id),
    egressFileNames: attempts.map((row) => row.fileName),
    derivedIds: extractions.map((row) => `drv_${row.id}`),
  };
}

/**
 * Removes a deleted meeting's files after its transaction committed, so a
 * rollback never loses media. Attachment rows are kept until their file is
 * gone; whatever fails here is left to the daily orphan sweep.
 */
export function removeMeetingFiles(files: MeetingFiles) {
  const attempt = (work: () => void) => {
    try { work(); } catch (error) {
      console.error(JSON.stringify({ event: "meeting_file_cleanup_failed", error: error instanceof Error ? error.message : String(error) }));
    }
  };
  for (const id of files.attachmentIds) attempt(() => purgeMediaAttachment(id));
  // Moved into the store but never registered: no attachment row would ever point at them.
  const registered = files.storedNames.length
    ? new Set(db.select({ storedName: attachments.storedName }).from(attachments).where(inArray(attachments.storedName, files.storedNames)).all().map((row) => row.storedName))
    : new Set<string>();
  for (const storedName of files.storedNames) {
    const full = getAttachmentAbsolutePath(storedName);
    if (!registered.has(storedName) && inside(UPLOADS_PATH, full)) attempt(() => fs.rmSync(full, { force: true }));
  }
  const egressDir = livekitConfig().egressDir;
  for (const id of files.uploadIds) attempt(() => fs.rmSync(path.join(UPLOAD_STAGING, id), { recursive: true, force: true }));
  for (const name of files.egressFileNames.filter((name) => EGRESS_FILE.test(name))) {
    attempt(() => fs.rmSync(path.join(egressDir, name), { force: true }));
    attempt(() => fs.rmSync(path.join(CALL_STAGING, name), { force: true }));
  }
  for (const id of files.derivedIds) attempt(() => fs.rmSync(derivedStagingPath(id), { force: true }));
}

/** Test hook: lets the next `runDailyOrphanSweep` run at once. */
export function resetOrphanSweepClock() { lastSweep = 0; }
