import "server-only";

import crypto from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { mediaUploadSessions, meetingJobInputs, meetingJobs, meetings } from "../schema";
import type { MeetingJobStage } from "../constants";

/**
 * Lease protocol of the meeting work queue:
 * - a claim takes a queued job, or a running job whose lease expired (crash or
 *   hang), and writes a fresh random claim token;
 * - heartbeats and completion only succeed with that token while the job is
 *   still running under an unexpired lease, so a worker that lost its lease
 *   can never commit output over a newer claim;
 * - completion writes the stage's output and the next job in one transaction.
 */
export const LEASE_MS = 5 * 60_000;
export const HEARTBEAT_MS = 30_000;

export type MeetingJob = typeof meetingJobs.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Transaction | typeof db;

export class LeaseLostError extends Error {
  constructor() { super("The job lease was lost"); }
}

/** A failure that retrying cannot fix (e.g. a file without audio). */
export class PermanentJobError extends Error {}

/** The job cannot run now for a reason outside the queue (missing API key, policy). */
export class BlockedJobError extends Error {}

export function enqueueJob(tx: Executor, input: {
  meetingId: string;
  stage: MeetingJobStage;
  executionKey: string;
  policyRevision: number;
  recordingId?: string | null;
  transcriptId?: string | null;
  inputRevision?: number;
  inputs?: string[];
  delayMs?: number;
}) {
  const job = tx.insert(meetingJobs).values({
    meetingId: input.meetingId,
    stage: input.stage,
    executionKey: input.executionKey,
    policyRevision: input.policyRevision,
    recordingId: input.recordingId ?? null,
    transcriptId: input.transcriptId ?? null,
    inputRevision: input.inputRevision ?? 1,
    nextAttemptAt: new Date(Date.now() + (input.delayMs ?? 0)),
  }).onConflictDoNothing({ target: meetingJobs.executionKey }).returning().get();
  if (job && input.inputs?.length) {
    tx.insert(meetingJobInputs).values([...new Set(input.inputs)].map((recordingId) => ({ jobId: job.id, recordingId }))).run();
  }
  return job ?? null;
}

const claimStatement = () => sqlite.prepare(`
  UPDATE meeting_jobs
  SET status = 'running', claim_token = @token, lease_until = @leaseUntil,
      heartbeat_at = @now, attempts = attempts + 1, updated_at = @now
  WHERE id = (
    SELECT id FROM meeting_jobs
    WHERE (status = 'queued' AND next_attempt_at <= @now)
       OR (status = 'running' AND lease_until < @now)
    ORDER BY next_attempt_at, created_at
    LIMIT 1
  )
  AND ((status = 'queued' AND next_attempt_at <= @now) OR (status = 'running' AND lease_until < @now))
  RETURNING id
`);

/** Claims the next runnable job, or null. Jobs over their attempt budget fail here. */
export function claimNextJob(now = Date.now()): MeetingJob | null {
  for (;;) {
    const row = claimStatement().get({ token: crypto.randomUUID(), now, leaseUntil: now + LEASE_MS }) as { id: string } | undefined;
    if (!row) return null;
    const job = db.select().from(meetingJobs).where(eq(meetingJobs.id, row.id)).get()!;
    if (job.attempts <= job.maxAttempts) return job;
    db.update(meetingJobs).set({ status: "failed", claimToken: null, leaseUntil: null, lastError: job.lastError || "Too many attempts", updatedAt: new Date() })
      .where(and(eq(meetingJobs.id, job.id), eq(meetingJobs.claimToken, job.claimToken!))).run();
  }
}

function holdsLease(tx: Executor, job: MeetingJob, now: number) {
  return and(
    eq(meetingJobs.id, job.id),
    eq(meetingJobs.claimToken, job.claimToken!),
    eq(meetingJobs.status, "running"),
    sql`${meetingJobs.leaseUntil} >= ${now}`,
  );
}

/** Extends the lease; false means another worker owns the job now. */
export function heartbeat(job: MeetingJob, now = Date.now()) {
  const result = db.update(meetingJobs)
    .set({ leaseUntil: new Date(now + LEASE_MS), heartbeatAt: new Date(now), updatedAt: new Date(now) })
    .where(holdsLease(db, job, now)).run();
  return result.changes === 1;
}

/**
 * Commits a stage: the guarded status change, the policy check and the
 * caller's writes share one transaction, so output from a lost lease or an
 * outdated AI policy is rolled back.
 */
export function completeJob<T>(job: MeetingJob, write: (tx: Transaction) => T, options: { checkPolicy?: boolean } = {}, now = Date.now()): T {
  return db.transaction((tx) => {
    const done = tx.update(meetingJobs)
      .set({ status: "done", claimToken: null, leaseUntil: null, lastError: "", updatedAt: new Date(now) })
      .where(holdsLease(tx, job, now)).run();
    if (done.changes !== 1) throw new LeaseLostError();
    if (options.checkPolicy) {
      const meeting = tx.select({ policyRevision: meetings.policyRevision }).from(meetings).where(eq(meetings.id, job.meetingId)).get();
      if (!meeting || meeting.policyRevision !== job.policyRevision) throw new LeaseLostError();
    }
    return write(tx);
  });
}

/** Records a failure under the job's own lease: retry with backoff, block or fail. */
export function failJob(job: MeetingJob, error: unknown, now = Date.now()) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
  const permanent = error instanceof PermanentJobError;
  const blocked = error instanceof BlockedJobError;
  const retry = !permanent && !blocked && job.attempts < job.maxAttempts;
  const backoffMs = Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, job.attempts - 1));
  db.update(meetingJobs).set({
    status: blocked ? "blocked" : retry ? "queued" : "failed",
    nextAttemptAt: new Date(now + (retry ? backoffMs : 0)),
    claimToken: null,
    leaseUntil: null,
    lastError: message,
    updatedAt: new Date(now),
  }).where(and(eq(meetingJobs.id, job.id), eq(meetingJobs.claimToken, job.claimToken!), eq(meetingJobs.status, "running"))).run();
}

/** Host action: run a failed or blocked job again with a fresh attempt budget. */
export function requeueJob(tx: Executor, jobId: string) {
  return tx.update(meetingJobs)
    .set({ status: "queued", attempts: 0, nextAttemptAt: new Date(), lastError: "", updatedAt: new Date() })
    .where(and(eq(meetingJobs.id, jobId), inArray(meetingJobs.status, ["failed", "blocked"]))).run().changes === 1;
}

/** Cancels pending AI work of a meeting, e.g. after its AI policy changed. */
export function cancelPendingJobs(tx: Executor, meetingId: string, stages: MeetingJobStage[]) {
  tx.update(meetingJobs).set({ status: "cancelled", claimToken: null, leaseUntil: null, updatedAt: new Date() })
    .where(and(
      eq(meetingJobs.meetingId, meetingId),
      inArray(meetingJobs.stage, stages),
      inArray(meetingJobs.status, ["queued", "running", "failed", "blocked"]),
    )).run();
}

/**
 * Leaves "processing" once nothing is left to run: failed or blocked jobs
 * wait for a person (retry on the recordings tab), cancelled ones never come.
 */
export function settleMeetingStatus(tx: Executor, meetingId: string) {
  const meeting = tx.select({ status: meetings.status }).from(meetings).where(eq(meetings.id, meetingId)).get();
  if (meeting?.status !== "processing") return;
  const active = tx.select({ id: meetingJobs.id }).from(meetingJobs).where(and(
    eq(meetingJobs.meetingId, meetingId),
    inArray(meetingJobs.stage, ["ingest", "extract_audio", "transcribe", "merge", "protocol"]),
    inArray(meetingJobs.status, ["queued", "running"]),
  )).get()
    ?? tx.select({ id: mediaUploadSessions.id }).from(mediaUploadSessions).where(and(
      eq(mediaUploadSessions.meetingId, meetingId), inArray(mediaUploadSessions.state, ["uploading", "assembling", "finalizing"]),
    )).get();
  if (!active) tx.update(meetings).set({ status: "review", updatedAt: new Date() }).where(eq(meetings.id, meetingId)).run();
}
