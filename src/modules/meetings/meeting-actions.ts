"use server";

import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { projects, user } from "@/db/schema";
import { requireUserOrThrow } from "@/lib/auth";
import { fail, revalidateMeeting, type MeetingActionResult } from "./action-helpers";
import { meetingFor } from "./access";
import { meetingAccessRoles, meetingAiPolicies } from "./constants";
import { cancelPendingJobs, enqueueJob, requeueJob, settleMeetingStatus } from "./processing/jobs";
import { audit, meetingHasMedia, retentionExpiry } from "./processing/store";
import { requestRecordingPurge } from "./processing/worker";
import { endOpenCalls } from "./calls/recording";
import { collectMeetingFiles, removeMeetingFiles } from "./processing/sweeper";
import {
  meetingAccess,
  meetingActionItemDecisions,
  meetingCallSessions,
  meetingJobs,
  meetingProtocols,
  meetingRecordings,
  meetings,
  meetingSessionTranscripts,
  meetingTranscripts,
} from "./schema";

const meetingFields = {
  title: z.string().trim().min(1).max(200),
  agenda: z.string().trim().max(10_000).default(""),
  startsAt: z.iso.datetime().nullable().default(null),
  projectId: z.string().min(1).nullable().default(null),
  language: z.enum(["de", "en"]).default("de"),
};

const createSchema = z.object({
  ...meetingFields,
  confidential: z.boolean().default(false),
  participantIds: z.array(z.string().min(1)).max(100).default([]),
});

function activeUserIds(ids: string[]) {
  if (!ids.length) return [];
  return db.select({ id: user.id }).from(user).where(and(inArray(user.id, ids), isNull(user.removedAt))).all().map((row) => row.id);
}

function projectExists(projectId: string | null) {
  return !projectId || Boolean(db.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).get());
}

export async function createMeeting(input: z.input<typeof createSchema>): Promise<MeetingActionResult<{ meetingId: string }>> {
  const viewer = await requireUserOrThrow();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success || !projectExists(parsed.data.projectId ?? null)) return fail("invalid");
  const data = parsed.data;
  const participants = activeUserIds(data.participantIds.filter((id) => id !== viewer.id));
  const meetingId = db.transaction((tx) => {
    const meeting = tx.insert(meetings).values({
      title: data.title,
      agenda: data.agenda,
      startsAt: data.startsAt ? new Date(data.startsAt) : null,
      projectId: data.projectId,
      language: data.language,
      confidential: data.confidential,
      // Confidential talks (e.g. personnel) start without AI; the host can opt in.
      aiPolicy: data.confidential ? "none" : "openai",
      createdBy: viewer.id,
    }).returning({ id: meetings.id }).get();
    tx.insert(meetingAccess).values([
      { meetingId: meeting.id, userId: viewer.id, role: "host" as const },
      ...participants.map((userId) => ({ meetingId: meeting.id, userId, role: "participant" as const })),
    ]).run();
    audit(tx, meeting.id, viewer.id, "meeting.created", { confidential: data.confidential });
    return meeting.id;
  });
  revalidateMeeting(meetingId);
  return { ok: true, meetingId };
}

const updateSchema = z.object({
  id: z.string().min(1),
  ...meetingFields,
  videoRetentionDays: z.number().int().min(1).max(3650),
  audioRetentionDays: z.number().int().min(1).max(3650),
});

export async function updateMeeting(input: z.input<typeof updateSchema>): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success || !projectExists(parsed.data.projectId ?? null)) return fail("invalid");
  const data = parsed.data;
  const access = meetingFor(data.id, viewer, "manage");
  if (!access.ok) return fail(access.error);
  db.transaction((tx) => {
    tx.update(meetings).set({
      title: data.title, agenda: data.agenda, startsAt: data.startsAt ? new Date(data.startsAt) : null, projectId: data.projectId,
      language: data.language, videoRetentionDays: data.videoRetentionDays, audioRetentionDays: data.audioRetentionDays, updatedAt: new Date(),
    }).where(eq(meetings.id, data.id)).run();
    // Retention applies to recordings already stored, too.
    const recordings = tx.select().from(meetingRecordings)
      .where(and(eq(meetingRecordings.meetingId, data.id), eq(meetingRecordings.purgeState, "active"))).all();
    for (const recording of recordings) {
      const days = recording.kind === "video" ? data.videoRetentionDays : data.audioRetentionDays;
      tx.update(meetingRecordings).set({ expiresAt: retentionExpiry(recording.createdAt, days) }).where(eq(meetingRecordings.id, recording.id)).run();
    }
    if (access.meeting.videoRetentionDays !== data.videoRetentionDays || access.meeting.audioRetentionDays !== data.audioRetentionDays) {
      audit(tx, data.id, viewer.id, "meeting.retentionChanged", { videoDays: data.videoRetentionDays, audioDays: data.audioRetentionDays });
    }
  });
  revalidateMeeting(data.id);
  return { ok: true };
}

const accessSchema = z.object({
  meetingId: z.string().min(1),
  members: z.array(z.object({ userId: z.string().min(1), role: z.enum(meetingAccessRoles) })).max(200),
});

export async function setMeetingAccess(input: z.input<typeof accessSchema>): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = accessSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const access = meetingFor(parsed.data.meetingId, viewer, "manage");
  if (!access.ok) return fail(access.error);
  const members = new Map(parsed.data.members.map((member) => [member.userId, member.role]));
  const valid = new Set(activeUserIds([...members.keys()]));
  // Existing members stay even if their account was removed meanwhile (history).
  const existing = db.select().from(meetingAccess).where(eq(meetingAccess.meetingId, parsed.data.meetingId)).all();
  for (const row of existing) if (members.has(row.userId)) valid.add(row.userId);
  if ([...members.keys()].some((id) => !valid.has(id))) return fail("invalid");
  if (![...members.values()].includes("host")) return fail("lastHost");
  db.transaction((tx) => {
    tx.delete(meetingAccess).where(eq(meetingAccess.meetingId, parsed.data.meetingId)).run();
    tx.insert(meetingAccess).values([...members].map(([userId, role]) => ({ meetingId: parsed.data.meetingId, userId, role }))).run();
    audit(tx, parsed.data.meetingId, viewer.id, "meeting.accessChanged", {
      before: existing.map(({ userId, role }) => ({ userId, role })),
      after: [...members].map(([userId, role]) => ({ userId, role })),
    });
  });
  // Tokens cannot be revoked, so removing someone or demoting them to viewer ends a running call; the others rejoin.
  const lostRights = existing.filter((row) => {
    const role = members.get(row.userId);
    return !role || (role === "viewer" && row.role !== "viewer");
  });
  if (lostRights.length) await endOpenCalls(parsed.data.meetingId, "accessChanged", viewer.id);
  revalidateMeeting(parsed.data.meetingId);
  return { ok: true };
}

const policySchema = z.object({
  meetingId: z.string().min(1),
  aiPolicy: z.enum(meetingAiPolicies),
  confidential: z.boolean(),
  /** Required when AI is turned on for a meeting that already has recordings. */
  aiDeclaration: z.boolean().default(false),
});

export async function setMeetingAiPolicy(input: z.input<typeof policySchema>): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = policySchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const data = parsed.data;
  const access = meetingFor(data.meetingId, viewer, "manage");
  if (!access.ok) return fail(access.error);
  const meeting = access.meeting;
  const enabling = meeting.aiPolicy === "none" && data.aiPolicy === "openai";
  const declared = db.transaction((tx) => {
    // The upload or call declarations covered "no AI"; sending that audio to OpenAI needs a new one.
    if (enabling && !data.aiDeclaration && meetingHasMedia(tx, meeting.id)) return false;
    const policyChanged = meeting.aiPolicy !== data.aiPolicy;
    const policyRevision = policyChanged ? meeting.policyRevision + 1 : meeting.policyRevision;
    tx.update(meetings).set({ aiPolicy: data.aiPolicy, confidential: data.confidential, policyRevision, updatedAt: new Date() })
      .where(eq(meetings.id, meeting.id)).run();
    if (!policyChanged) return;
    cancelPendingJobs(tx, meeting.id, ["transcribe", "merge", "protocol"]);
    settleMeetingStatus(tx, meeting.id);
    audit(tx, meeting.id, viewer.id, "meeting.aiPolicyChanged", { from: meeting.aiPolicy, to: data.aiPolicy, declaration: enabling ? { aiProcessing: true, at: new Date().toISOString() } : null });
    if (data.aiPolicy !== "openai") return;
    // Transcribe audio that was stored while AI was off.
    const derived = tx.select().from(meetingRecordings).where(and(
      eq(meetingRecordings.meetingId, meeting.id), eq(meetingRecordings.kind, "derived_audio"), eq(meetingRecordings.purgeState, "active"),
    )).all();
    for (const recording of derived) {
      enqueueJob(tx, {
        meetingId: meeting.id, stage: "transcribe", recordingId: recording.id, policyRevision,
        executionKey: `transcribe:${recording.id}:${policyRevision}`, inputs: [recording.id],
      });
    }
    if (derived.length) tx.update(meetings).set({ status: meeting.approvedProtocolId ? meeting.status : "processing" }).where(eq(meetings.id, meeting.id)).run();
  }, { behavior: "immediate" });
  if (declared === false) return fail("declaration");
  // Consent to a recorded call covered the old AI setting.
  if (meeting.aiPolicy !== data.aiPolicy) await endOpenCalls(meeting.id, "aiPolicyChanged", viewer.id);
  revalidateMeeting(meeting.id);
  return { ok: true };
}

export async function retryMeetingJob(jobId: string): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const job = db.select().from(meetingJobs).where(eq(meetingJobs.id, String(jobId))).get();
  if (!job) return fail("notFound");
  const access = meetingFor(job.meetingId, viewer, "contribute");
  if (!access.ok) return fail(access.error);
  if (!requeueJob(db, job.id)) return fail("stale");
  db.update(meetings).set({ status: "processing", updatedAt: new Date() })
    .where(and(eq(meetings.id, job.meetingId), eq(meetings.status, "review"), isNull(meetings.approvedProtocolId))).run();
  audit(db, job.meetingId, viewer.id, "job.retried", { jobId: job.id, stage: job.stage });
  revalidateMeeting(job.meetingId);
  return { ok: true };
}

/** Permanently deletes a recording and the audio derived from it. */
export async function deleteMeetingRecording(recordingId: string): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const recording = db.select().from(meetingRecordings).where(eq(meetingRecordings.id, String(recordingId))).get();
  if (!recording) return fail("notFound");
  const access = meetingFor(recording.meetingId, viewer, "manage");
  if (!access.ok) return fail(access.error);
  const related = db.select({ id: meetingRecordings.id }).from(meetingRecordings).where(eq(meetingRecordings.sourceRecordingId, recording.id)).all();
  for (const id of [recording.id, ...related.map((row) => row.id)]) requestRecordingPurge(id, viewer.id, "deletedByHost");
  revalidateMeeting(recording.meetingId);
  return { ok: true };
}

/**
 * Deletes a meeting with all media, transcripts and protocols. Refused while
 * the worker is processing it, so no job writes into a deleted meeting. Tasks
 * created from it remain; the audit log keeps the deletion.
 */
export async function deleteMeeting(meetingId: string): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const access = meetingFor(String(meetingId), viewer, "manage");
  if (!access.ok) return fail(access.error);
  const id = access.meeting.id;
  const running = db.select({ id: meetingJobs.id }).from(meetingJobs)
    .where(and(eq(meetingJobs.meetingId, id), eq(meetingJobs.status, "running"))).get();
  if (running) return fail("busy");
  await endOpenCalls(id, "meetingDeleted", viewer.id);
  const files = db.transaction((tx) => {
    // Files are only collected here: unlinking inside the transaction would lose them on a rollback.
    const collected = collectMeetingFiles(tx, id);
    sqlite.prepare("DELETE FROM meeting_segments_fts WHERE meeting_id = ?").run(id);
    sqlite.prepare("DELETE FROM meeting_protocols_fts WHERE meeting_id = ?").run(id);
    tx.delete(meetingSessionTranscripts).where(eq(meetingSessionTranscripts.meetingId, id)).run();
    tx.delete(meetingTranscripts).where(eq(meetingTranscripts.meetingId, id)).run();
    tx.delete(meetingProtocols).where(eq(meetingProtocols.meetingId, id)).run();
    tx.delete(meetingActionItemDecisions).where(eq(meetingActionItemDecisions.meetingId, id)).run();
    tx.delete(meetingCallSessions).where(eq(meetingCallSessions.meetingId, id)).run();
    tx.delete(meetings).where(eq(meetings.id, id)).run();
    audit(tx, id, viewer.id, "meeting.deleted", { title: access.meeting.title, files: collected.attachmentIds.length });
    return collected;
  });
  // The attachment rows stay until their file is gone; no one can open them
  // without the meeting, and a failed unlink is retried by the orphan sweep.
  removeMeetingFiles(files);
  revalidateMeeting();
  return { ok: true };
}
