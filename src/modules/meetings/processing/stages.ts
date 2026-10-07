import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { and, asc, desc, eq, inArray, max, ne, or, sql } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { attachments, user } from "@/db/schema";
import { moveStagedFileIntoStore, newStoredName, purgeMediaAttachment, registerStagedAttachment } from "@/lib/files";
import {
  meetingAccess,
  meetingCallSessions,
  meetingEgressAttempts,
  meetingJobInputs,
  meetingJobs,
  meetingProtocols,
  meetingRecordings,
  meetings,
  meetingSessionSegments,
  meetingSessionTranscripts,
  meetingSpeakerMaps,
  meetingTranscripts,
  meetingTranscriptSegments,
} from "../schema";
import { parseProtocolContent } from "../protocol-content";
import { completeJob, enqueueJob, LeaseLostError, PermanentJobError, type MeetingJob } from "./jobs";
import { extractSpeechAudio, probeMedia } from "./media-tools";
import { generateProtocol, PROTOCOL_PROMPT_VERSION } from "./protocol-ai";
import { audit, DERIVED_STAGING, derivedStagingPath, recordingFilePath, retentionExpiry } from "./store";
import { transcribeAudio } from "./transcription";

export type StageContext = { signal: AbortSignal; assertLease: () => void };

function loadMeeting(id: string) {
  const meeting = db.select().from(meetings).where(eq(meetings.id, id)).get();
  if (!meeting) throw new PermanentJobError("Meeting was deleted");
  return meeting;
}

function loadRecording(id: string | null) {
  const recording = id ? db.select().from(meetingRecordings).where(eq(meetingRecordings.id, id)).get() : undefined;
  if (!recording || recording.purgeState !== "active") throw new PermanentJobError("Recording is no longer available");
  return recording;
}

/** Throws unless the meeting still allows AI under the job's policy revision. */
function assertAiAllowed(job: MeetingJob) {
  const meeting = loadMeeting(job.meetingId);
  if (meeting.policyRevision !== job.policyRevision) throw new LeaseLostError();
  if (meeting.aiPolicy !== "openai") throw new PermanentJobError("AI processing is turned off for this meeting");
  return meeting;
}

async function hashFile(file: string) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

async function ingest(job: MeetingJob, context: StageContext) {
  const recording = loadRecording(job.recordingId);
  const file = recordingFilePath(recording.id);
  if (!file) throw new PermanentJobError("Recording file is missing");
  const probe = await probeMedia(file, context.signal);
  if (!probe.hasAudio) throw new PermanentJobError("The recording has no audio track");
  const meeting = loadMeeting(job.meetingId);
  const kind = probe.hasVideo ? "video" as const : "audio" as const;
  completeJob(job, (tx) => {
    tx.update(meetingRecordings).set({
      kind,
      durationMs: probe.durationMs,
      expiresAt: retentionExpiry(recording.createdAt, kind === "video" ? meeting.videoRetentionDays : meeting.audioRetentionDays),
    }).where(eq(meetingRecordings.id, recording.id)).run();
    enqueueJob(tx, {
      meetingId: job.meetingId, stage: "extract_audio", recordingId: recording.id, policyRevision: meeting.policyRevision,
      executionKey: `extract:${recording.id}`, inputs: [recording.id],
    });
  });
}

async function extractAudio(job: MeetingJob, context: StageContext) {
  const recording = loadRecording(job.recordingId);
  const file = recordingFilePath(recording.id);
  if (!file) throw new PermanentJobError("Recording file is missing");
  // The derived recording id is fixed per job, so a retry or a crash after the
  // commit finds the same staging file (see recordingFilePath).
  const derivedId = `drv_${job.id}`;
  const staged = derivedStagingPath(derivedId);
  fs.mkdirSync(DERIVED_STAGING, { recursive: true });
  await extractSpeechAudio(file, staged, recording.durationMs ?? 0, context.signal);
  const [probe, sha256] = await Promise.all([probeMedia(staged, context.signal), hashFile(staged)]);
  const sizeBytes = fs.statSync(staged).size;
  const meeting = loadMeeting(job.meetingId);
  const storedName = newStoredName(sha256, ".ogg");
  try {
    completeJob(job, (tx) => {
      const attachment = registerStagedAttachment(
        { storedName, fileName: `${path.parse(recording.fileName).name || "recording"}.ogg`, mimeType: "audio/ogg", sizeBytes, sha256 },
        { entityType: "meetingRecording", entityId: job.meetingId, userId: recording.createdBy },
      );
      tx.insert(meetingRecordings).values({
        id: derivedId, meetingId: job.meetingId, sourceRecordingId: recording.id, attachmentId: attachment.id,
        kind: "derived_audio", speakerScope: recording.speakerScope, source: recording.source, fileName: attachment.fileName,
        sizeBytes, sha256, durationMs: probe.durationMs, offsetMs: recording.offsetMs, consentEvidence: recording.consentEvidence,
        callSessionId: recording.callSessionId, speakerUserId: recording.speakerUserId, mediaStartedAt: recording.mediaStartedAt,
        expiresAt: retentionExpiry(recording.createdAt, meeting.audioRetentionDays), createdBy: recording.createdBy,
      }).run();
      if (meeting.aiPolicy === "openai") {
        enqueueJob(tx, {
          meetingId: job.meetingId, stage: "transcribe", recordingId: derivedId, policyRevision: meeting.policyRevision,
          executionKey: `transcribe:${derivedId}:${meeting.policyRevision}`, inputs: [derivedId],
        });
      } else if (meeting.status === "processing") {
        tx.update(meetings).set({ status: "review", updatedAt: new Date() }).where(eq(meetings.id, job.meetingId)).run();
      }
    });
  } catch (error) {
    fs.rmSync(staged, { force: true });
    throw error;
  }
  moveStagedFileIntoStore(staged, storedName);
}

async function transcribe(job: MeetingJob, context: StageContext) {
  const recording = loadRecording(job.recordingId);
  const meeting = assertAiAllowed(job);
  const file = recordingFilePath(recording.id);
  if (!file) throw new PermanentJobError("Audio file is missing");
  const result = await transcribeAudio({
    file,
    durationMs: recording.durationMs ?? 0,
    language: meeting.language,
    signal: context.signal,
    beforeRequest: () => { context.assertLease(); assertAiAllowed(job); },
  });
  // A call track holds one person's microphone: diarization labels would only add noise.
  const segments = recording.speakerScope === "single"
    ? result.segments.map((segment) => ({ ...segment, speakerKey: "speaker" }))
    : result.segments;
  completeJob(job, (tx) => {
    const revision = (tx.select({ value: max(meetingTranscripts.revision) }).from(meetingTranscripts)
      .where(eq(meetingTranscripts.recordingId, recording.id)).get()?.value ?? 0) + 1;
    const transcript = tx.insert(meetingTranscripts).values({
      meetingId: job.meetingId, recordingId: recording.id, revision, engine: result.engine, model: result.model,
      language: meeting.language, status: "completed",
    }).returning().get();
    segments.forEach((segment, position) => {
      tx.insert(meetingTranscriptSegments).values({ transcriptId: transcript.id, position, ...segment }).run();
    });
    audit(tx, job.meetingId, null, "ai.transcribe", { engine: result.engine, model: result.model, recordingId: recording.id });
    enqueueJob(tx, {
      meetingId: job.meetingId, stage: "merge", transcriptId: transcript.id, policyRevision: meeting.policyRevision,
      executionKey: `merge:${transcript.id}`,
    });
  }, { checkPolicy: true });
}

const ACTIVE_PIPELINE_STAGES = ["ingest", "extract_audio", "transcribe"] as const;

/**
 * Places every recording's latest transcript on one meeting timeline. While
 * another recording of the meeting is still in the pipeline, this merge is a
 * no-op: that recording's own transcript triggers the merge that includes all.
 */
async function merge(job: MeetingJob) {
  const meeting = loadMeeting(job.meetingId);
  completeJob(job, (tx) => {
    const busy = tx.select({ id: meetingJobs.id }).from(meetingJobs).where(and(
      eq(meetingJobs.meetingId, job.meetingId),
      inArray(meetingJobs.stage, [...ACTIVE_PIPELINE_STAGES]),
      inArray(meetingJobs.status, ["queued", "running"]),
    )).get();
    // A running call, or call recordings not yet in the store, will trigger their own merge.
    const callPending = tx.select({ id: meetingCallSessions.id }).from(meetingCallSessions)
      .where(and(eq(meetingCallSessions.meetingId, job.meetingId), eq(meetingCallSessions.status, "open"))).get()
      ?? tx.select({ id: meetingEgressAttempts.id }).from(meetingEgressAttempts)
        .innerJoin(meetingCallSessions, eq(meetingCallSessions.id, meetingEgressAttempts.sessionId))
        .where(and(eq(meetingCallSessions.meetingId, job.meetingId), inArray(meetingEgressAttempts.state, ["calling", "started", "unknown", "complete"]))).get();
    if (busy || callPending) return;
    const originals = tx.select().from(meetingRecordings).where(and(
      eq(meetingRecordings.meetingId, job.meetingId), ne(meetingRecordings.kind, "derived_audio"),
    )).orderBy(asc(meetingRecordings.createdAt)).all();
    const manifest: Array<{ transcriptId: string; recordingId: string; offsetMs: number }> = [];
    const missing: Array<{ recordingId: string; reason: string }> = [];
    const speakers = new Map<number, string>();
    // Call tracks sit on the timeline by their wall-clock start; uploads follow one after another.
    const callStarts = originals.map((original) => original.mediaStartedAt).filter((value): value is number => value !== null);
    const callBase = callStarts.length ? Math.min(...callStarts) : 0;
    let offset = originals.filter((original) => original.mediaStartedAt !== null)
      .reduce((end, original) => Math.max(end, original.mediaStartedAt! - callBase + (original.durationMs ?? 0)), 0);
    for (const original of originals) {
      const derived = tx.select().from(meetingRecordings).where(eq(meetingRecordings.sourceRecordingId, original.id)).get();
      const transcript = derived && tx.select().from(meetingTranscripts)
        .where(and(eq(meetingTranscripts.recordingId, derived.id), eq(meetingTranscripts.status, "completed")))
        .orderBy(desc(meetingTranscripts.revision)).get();
      const onCall = original.mediaStartedAt !== null;
      if (transcript) {
        manifest.push({ transcriptId: transcript.id, recordingId: original.id, offsetMs: onCall ? original.mediaStartedAt! - callBase : offset });
        if (original.speakerUserId) speakers.set(manifest.length, original.speakerUserId);
      } else missing.push({ recordingId: original.id, reason: "noTranscript" });
      if (!onCall) offset += original.durationMs ?? 0;
    }
    if (!manifest.length) return;
    const previous = tx.select().from(meetingSessionTranscripts).where(eq(meetingSessionTranscripts.meetingId, job.meetingId))
      .orderBy(desc(meetingSessionTranscripts.revision)).get();
    const session = tx.insert(meetingSessionTranscripts).values({
      meetingId: job.meetingId, revision: (previous?.revision ?? 0) + 1,
      inputManifest: JSON.stringify(manifest), missingInputs: JSON.stringify(missing),
    }).returning().get();
    sqlite.prepare("DELETE FROM meeting_segments_fts WHERE meeting_id = ?").run(job.meetingId);
    const insertFts = sqlite.prepare("INSERT INTO meeting_segments_fts (segment_id, meeting_id, text) VALUES (?, ?, ?)");
    // Segments of all tracks interleave by time, as they were spoken.
    const timeline = manifest.flatMap((input, index) => tx.select().from(meetingTranscriptSegments)
      .where(eq(meetingTranscriptSegments.transcriptId, input.transcriptId)).orderBy(asc(meetingTranscriptSegments.position)).all()
      .map((segment) => ({ segment, index, startMs: input.offsetMs + segment.startMs, endMs: input.offsetMs + segment.endMs })))
      .sort((a, b) => a.startMs - b.startMs || a.index - b.index);
    for (const [position, { segment, index, startMs, endMs }] of timeline.entries()) {
      const row = tx.insert(meetingSessionSegments).values({
        sessionTranscriptId: session.id, position, startMs, endMs,
        speakerKey: `r${index + 1}:${segment.speakerKey}`, sourceSegmentId: segment.id, text: segment.text,
      }).returning({ id: meetingSessionSegments.id }).get();
      insertFts.run(row.id, job.meetingId, segment.text);
    }
    // Carry over speaker names for keys that still exist.
    const previousMap = previous && tx.select().from(meetingSpeakerMaps).where(eq(meetingSpeakerMaps.sessionTranscriptId, previous.id))
      .orderBy(desc(meetingSpeakerMaps.revision)).get();
    // Call tracks are already known people; earlier manual names win.
    const map = JSON.parse(previousMap?.map ?? "{}") as Record<string, { userId: string | null; label: string }>;
    for (const [index, userId] of speakers) {
      const key = `r${index}:speaker`;
      const person = tx.select({ name: user.name }).from(user).where(eq(user.id, userId)).get();
      if (!map[key] && person) map[key] = { userId, label: person.name };
    }
    tx.insert(meetingSpeakerMaps).values({ sessionTranscriptId: session.id, revision: 1, map: JSON.stringify(map) }).run();
    if (meeting.aiPolicy === "openai") {
      enqueueJob(tx, {
        meetingId: job.meetingId, stage: "protocol", transcriptId: session.id, policyRevision: meeting.policyRevision,
        executionKey: `protocol:${session.id}:1`,
      });
    } else {
      tx.update(meetings).set({ status: meeting.approvedProtocolId ? meeting.status : "review", updatedAt: new Date() }).where(eq(meetings.id, job.meetingId)).run();
    }
  });
}

async function protocol(job: MeetingJob, context: StageContext) {
  const meeting = assertAiAllowed(job);
  const session = job.transcriptId
    ? db.select().from(meetingSessionTranscripts).where(eq(meetingSessionTranscripts.id, job.transcriptId)).get()
    : undefined;
  if (!session) throw new PermanentJobError("Transcript is missing");
  const speakerMap = db.select().from(meetingSpeakerMaps).where(eq(meetingSpeakerMaps.sessionTranscriptId, session.id))
    .orderBy(desc(meetingSpeakerMaps.revision)).get();
  const map = JSON.parse(speakerMap?.map ?? "{}") as Record<string, { userId: string | null; label: string }>;
  const segments = db.select().from(meetingSessionSegments).where(eq(meetingSessionSegments.sessionTranscriptId, session.id))
    .orderBy(asc(meetingSessionSegments.position)).all();
  const participants = db.select({ id: user.id, name: user.name }).from(meetingAccess).innerJoin(user, eq(user.id, meetingAccess.userId))
    .where(eq(meetingAccess.meetingId, meeting.id)).orderBy(asc(user.name)).all();
  const current = meeting.currentProtocolId
    ? db.select().from(meetingProtocols).where(eq(meetingProtocols.id, meeting.currentProtocolId)).get()
    : undefined;
  context.assertLease();
  const result = await generateProtocol({
    meetingId: meeting.id,
    title: meeting.title,
    language: meeting.language,
    agenda: meeting.agenda,
    participants,
    speakers: Object.fromEntries(Object.entries(map).map(([key, value]) => [key, value.label])),
    segments,
    previousActionItems: current ? parseProtocolContent(current.content).actionItems.map(({ itemKey, text }) => ({ itemKey, text })) : [],
    safetyIdentifier: crypto.createHash("sha256").update(`meeting:${meeting.createdBy}`).digest("hex").slice(0, 32),
  }, context.signal);
  completeJob(job, (tx) => {
    const version = (tx.select({ value: max(meetingProtocols.version) }).from(meetingProtocols)
      .where(eq(meetingProtocols.meetingId, meeting.id)).get()?.value ?? 0) + 1;
    const row = tx.insert(meetingProtocols).values({
      meetingId: meeting.id, version, sessionTranscriptId: session.id, speakerMapRevision: speakerMap?.revision ?? 1,
      content: JSON.stringify(result.content), source: "ai", model: result.model, promptVersion: PROTOCOL_PROMPT_VERSION,
    }).returning().get();
    tx.update(meetings).set({
      currentProtocolId: row.id,
      status: meeting.approvedProtocolId ? meeting.status : "review",
      updatedAt: new Date(),
    }).where(eq(meetings.id, meeting.id)).run();
    audit(tx, meeting.id, null, "ai.protocol", { model: result.model, version, sessionTranscriptId: session.id });
  }, { checkPolicy: true });
}

/** Other queued/running work still reading this recording (the purge job itself excluded). */
function recordingInUse(job: MeetingJob, recordingId: string) {
  const now = Date.now();
  return db.select({ id: meetingJobs.id }).from(meetingJobs)
    .leftJoin(meetingJobInputs, eq(meetingJobInputs.jobId, meetingJobs.id))
    .where(and(
      ne(meetingJobs.id, job.id),
      or(eq(meetingJobs.recordingId, recordingId), eq(meetingJobInputs.recordingId, recordingId)),
      or(eq(meetingJobs.status, "queued"), and(eq(meetingJobs.status, "running"), sql`${meetingJobs.leaseUntil} >= ${now}`)),
    )).get();
}

async function purge(job: MeetingJob) {
  const recording = job.recordingId ? db.select().from(meetingRecordings).where(eq(meetingRecordings.id, job.recordingId)).get() : undefined;
  if (!recording || recording.purgeState === "purged") {
    completeJob(job, () => undefined);
    return;
  }
  if (recordingInUse(job, recording.id)) throw new Error("Recording is still being processed");
  try {
    completeJob(job, (tx) => {
      if (recording.attachmentId && tx.select({ id: attachments.id }).from(attachments).where(eq(attachments.id, recording.attachmentId)).get()) {
        purgeMediaAttachment(recording.attachmentId);
      }
      tx.update(meetingRecordings).set({ purgeState: "purged", purgedAt: new Date(), attachmentId: null })
        .where(eq(meetingRecordings.id, recording.id)).run();
      audit(tx, recording.meetingId, null, "recording.purged", { recordingId: recording.id, kind: recording.kind });
    });
  } catch (error) {
    if (!(error instanceof LeaseLostError)) {
      db.update(meetingRecordings).set({ purgeState: "purge_failed" }).where(eq(meetingRecordings.id, recording.id)).run();
    }
    throw error;
  }
}

export const stageHandlers: Record<MeetingJob["stage"], (job: MeetingJob, context: StageContext) => Promise<void>> = {
  ingest,
  extract_audio: extractAudio,
  transcribe,
  merge: (job) => merge(job),
  protocol,
  purge: (job) => purge(job),
};

