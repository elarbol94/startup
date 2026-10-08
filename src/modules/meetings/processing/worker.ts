import "server-only";

import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import { meetingJobInputs, meetingJobs, meetingRecordings, meetings } from "../schema";
import { claimNextJob, enqueueJob, failJob, heartbeat, HEARTBEAT_MS, LeaseLostError, settleMeetingStatus, type MeetingJob } from "./jobs";
import { stageHandlers } from "./stages";
import { audit, DERIVED_STAGING, retentionExpiry } from "./store";
import { runDailyOrphanSweep } from "./sweeper";
import { processUploadSessions } from "./uploads";
import { reconcileCalls } from "../calls/recording";

/** Runs one claimed job with a heartbeat; losing the lease aborts the work. */
async function runJob(job: MeetingJob) {
  const controller = new AbortController();
  let leaseLost = false;
  const beat = setInterval(() => {
    if (!heartbeat(job)) {
      leaseLost = true;
      controller.abort(new LeaseLostError());
    }
  }, HEARTBEAT_MS);
  beat.unref?.();
  try {
    await stageHandlers[job.stage](job, {
      signal: controller.signal,
      assertLease: () => { if (leaseLost) throw new LeaseLostError(); },
    });
  } catch (error) {
    if (error instanceof LeaseLostError || leaseLost) {
      console.warn(JSON.stringify({ event: "meeting_job_lease_lost", jobId: job.id, stage: job.stage }));
      return;
    }
    console.error(JSON.stringify({ event: "meeting_job_failed", jobId: job.id, stage: job.stage, attempts: job.attempts, error: error instanceof Error ? error.message : String(error) }));
    failJob(job, error);
    settleMeetingStatus(db, job.meetingId);
  } finally {
    clearInterval(beat);
  }
}

/**
 * Schedules purges of recordings past their retention date. Failed or blocked
 * jobs never keep expired media alive: they are cancelled together with the
 * purge request.
 */
export function scheduleRetentionPurges(now = new Date()) {
  // Recordings stored before uploads got their expiry at finalize, whose ingest then failed.
  const undated = db.select({ id: meetingRecordings.id, kind: meetingRecordings.kind, createdAt: meetingRecordings.createdAt, videoDays: meetings.videoRetentionDays, audioDays: meetings.audioRetentionDays })
    .from(meetingRecordings).innerJoin(meetings, eq(meetings.id, meetingRecordings.meetingId))
    .where(and(eq(meetingRecordings.purgeState, "active"), isNull(meetingRecordings.expiresAt))).all();
  for (const row of undated) {
    db.update(meetingRecordings).set({ expiresAt: retentionExpiry(row.createdAt, row.kind === "video" ? row.videoDays : row.audioDays) })
      .where(and(eq(meetingRecordings.id, row.id), isNull(meetingRecordings.expiresAt))).run();
  }
  const expired = db.select().from(meetingRecordings)
    .where(and(inArray(meetingRecordings.purgeState, ["active", "purge_failed"]), lt(meetingRecordings.expiresAt, now))).all();
  for (const recording of expired) requestRecordingPurge(recording.id, null, "retention");
}

/** Marks a recording for permanent deletion and queues the purge job. */
export function requestRecordingPurge(recordingId: string, actorId: string | null, reason: string) {
  db.transaction((tx) => {
    const recording = tx.select().from(meetingRecordings).where(eq(meetingRecordings.id, recordingId)).get();
    if (!recording || recording.purgeState === "purged") return;
    const blockedJobs = tx.select({ id: meetingJobs.id }).from(meetingJobs)
      .leftJoin(meetingJobInputs, eq(meetingJobInputs.jobId, meetingJobs.id))
      .where(and(inArray(meetingJobs.status, ["failed", "blocked"]), eq(meetingJobInputs.recordingId, recordingId))).all();
    if (blockedJobs.length) {
      tx.update(meetingJobs).set({ status: "cancelled", lastError: "media_expired", updatedAt: new Date() })
        .where(inArray(meetingJobs.id, blockedJobs.map((job) => job.id))).run();
    }
    tx.update(meetingRecordings).set({ purgeState: "purging" }).where(eq(meetingRecordings.id, recordingId)).run();
    const meeting = tx.select({ policyRevision: meetings.policyRevision }).from(meetings).where(eq(meetings.id, recording.meetingId)).get();
    enqueueJob(tx, {
      meetingId: recording.meetingId, stage: "purge", recordingId, policyRevision: meeting?.policyRevision ?? 1,
      executionKey: `purge:${recordingId}`,
    });
    // A purge waits for other work on the file, so it gets room to retry; an
    // earlier purge that gave up is started again.
    tx.update(meetingJobs).set({ maxAttempts: 100 }).where(eq(meetingJobs.executionKey, `purge:${recordingId}`)).run();
    tx.update(meetingJobs).set({ status: "queued", attempts: 0, nextAttemptAt: new Date(), updatedAt: new Date() })
      .where(and(eq(meetingJobs.executionKey, `purge:${recordingId}`), inArray(meetingJobs.status, ["failed", "cancelled", "blocked"]))).run();
    audit(tx, recording.meetingId, actorId, "recording.purgeRequested", { recordingId, reason });
  });
}

/** Derived-audio staging files older than a day that no recording refers to. */
function sweepDerivedStaging(now = Date.now()) {
  if (!fs.existsSync(DERIVED_STAGING)) return;
  for (const entry of fs.readdirSync(DERIVED_STAGING)) {
    const full = path.join(DERIVED_STAGING, entry);
    if (fs.statSync(full).mtimeMs > now - 24 * 60 * 60_000) continue;
    const recordingId = path.parse(entry).name;
    const recording = db.select({ id: meetingRecordings.id }).from(meetingRecordings).where(eq(meetingRecordings.id, recordingId)).get();
    // Present → the move into the store is still pending; recordingFilePath finishes it.
    if (!recording) fs.rmSync(full, { force: true });
  }
}

/** Names of the maintenance tasks currently running; each runs at most once at a time. */
const running = new Set<string>();
let lastHousekeeping = 0;
let lastCallReconcile = 0;
let draining = false;

/** Runs a task unless its previous run is still going; errors are logged, never thrown. */
async function guarded(name: string, task: () => Promise<void> | void) {
  if (running.has(name)) return;
  running.add(name);
  try {
    await task();
  } catch (error) {
    console.error(JSON.stringify({ event: "meeting_worker_error", task: name, error: error instanceof Error ? error.message : String(error) }));
  } finally {
    running.delete(name);
  }
}

/**
 * Upload assembly, call reconciliation and retention, independent of the job
 * queue: a transcription that takes minutes must not hold up an upload that
 * waits for assembly or a call recording that waits to be taken over. The
 * three tasks have separate guards, so a long assembly does not delay calls.
 */
export async function runMeetingMaintenanceTick(now = Date.now()) {
  await Promise.all([
    // Uploads waiting for assembly should not wait for the minute-long cycle.
    guarded("uploads", () => processUploadSessions()),
    guarded("calls", async () => {
      if (now - lastCallReconcile <= 30_000) return;
      lastCallReconcile = now;
      await reconcileCalls();
    }),
    guarded("housekeeping", () => {
      if (now - lastHousekeeping <= 60_000) return;
      lastHousekeeping = now;
      scheduleRetentionPurges();
      sweepDerivedStaging();
      runDailyOrphanSweep();
      // Also releases meetings left in "processing" by earlier failures or aborted uploads.
      for (const { id } of db.select({ id: meetings.id }).from(meetings).where(eq(meetings.status, "processing")).all()) settleMeetingStatus(db, id);
    }),
  ]);
}

/** Runs queued jobs one after another until none is runnable; a second call while draining returns at once. */
export async function drainMeetingJobs() {
  if (draining) return;
  draining = true;
  try {
    for (let job = claimNextJob(); job; job = claimNextJob()) await runJob(job);
  } catch (error) {
    console.error(JSON.stringify({ event: "meeting_worker_error", task: "jobs", error: error instanceof Error ? error.message : String(error) }));
  } finally {
    draining = false;
  }
}

/** One full pass: maintenance, then the job queue until it is empty (used by tests and scripts). */
export async function runMeetingWorkerTick() {
  await runMeetingMaintenanceTick();
  await drainMeetingJobs();
}

/** Two independent loops: maintenance and the job queue never wait for each other. */
export function startMeetingWorker() {
  const state = globalThis as typeof globalThis & { __meetingWorkerTimers?: ReturnType<typeof setInterval>[] };
  if (state.__meetingWorkerTimers) return;
  void runMeetingMaintenanceTick();
  void drainMeetingJobs();
  state.__meetingWorkerTimers = [
    setInterval(() => { void runMeetingMaintenanceTick(); }, 5_000),
    setInterval(() => { void drainMeetingJobs(); }, 5_000),
  ];
  for (const timer of state.__meetingWorkerTimers) timer.unref?.();
}
