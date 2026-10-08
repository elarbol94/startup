import { createId } from "@paralleldrive/cuid2";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { attachments, user } from "@/db/core-schema";
import { calendarEvents } from "@/modules/calendar/schema";
import { projects } from "@/modules/projects/schema";
import {
  mediaUploadStates,
  meetingAccessRoles,
  meetingAiPolicies,
  meetingJobStages,
  meetingJobStatuses,
  meetingModes,
  meetingPurgeStates,
  meetingRecordingKinds,
  meetingRecordingSources,
  meetingSpeakerScopes,
  meetingStatuses,
} from "./constants";

export * from "./transcript-schema";
export * from "./call-schema";

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());
const updatedAt = () => integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());

/**
 * One meeting (one calendar occurrence, or a standalone meeting with uploaded
 * recordings). `meeting_access` is its only access list; `projectId` is
 * navigation only and grants nobody access.
 */
export const meetings = sqliteTable(
  "meetings",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    title: text("title").notNull(),
    /** Agenda / notes typed by people; the only extra context the AI receives. */
    agenda: text("agenda").notNull().default(""),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }),
    calendarEventId: text("calendar_event_id").references(() => calendarEvents.id, { onDelete: "set null" }),
    occurrenceKey: text("occurrence_key"),
    projectId: text("project_id").references(() => projects.id, { onDelete: "set null" }),
    status: text("status", { enum: meetingStatuses }).notNull().default("scheduled"),
    mode: text("mode", { enum: meetingModes }).notNull().default("upload"),
    aiPolicy: text("ai_policy", { enum: meetingAiPolicies }).notNull().default("openai"),
    /** Bumped on every AI policy change; jobs started under an older revision abort. */
    policyRevision: integer("policy_revision").notNull().default(1),
    confidential: integer("confidential", { mode: "boolean" }).notNull().default(false),
    language: text("language").notNull().default("de"),
    videoRetentionDays: integer("video_retention_days").notNull().default(30),
    audioRetentionDays: integer("audio_retention_days").notNull().default(90),
    currentProtocolId: text("current_protocol_id"),
    approvedProtocolId: text("approved_protocol_id"),
    createdBy: text("created_by").notNull().references(() => user.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("meetings_occurrence_unique").on(table.calendarEventId, table.occurrenceKey),
    index("meetings_starts_at_idx").on(table.startsAt),
    index("meetings_project_idx").on(table.projectId),
  ],
);

export const meetingAccess = sqliteTable(
  "meeting_access",
  {
    meetingId: text("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: meetingAccessRoles }).notNull().default("participant"),
    createdAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.meetingId, table.userId] }), index("meeting_access_user_idx").on(table.userId)],
);

/**
 * A stored recording. The attachment row disappears on purge; this row stays
 * (with `purgeState = purged`) so transcripts keep their provenance.
 */
export const meetingRecordings = sqliteTable(
  "meeting_recordings",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    meetingId: text("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    /** The original this derived audio was made from. */
    sourceRecordingId: text("source_recording_id"),
    attachmentId: text("attachment_id").references(() => attachments.id, { onDelete: "set null" }),
    kind: text("kind", { enum: meetingRecordingKinds }).notNull(),
    speakerScope: text("speaker_scope", { enum: meetingSpeakerScopes }).notNull().default("mixed"),
    source: text("source", { enum: meetingRecordingSources }).notNull().default("upload"),
    fileName: text("file_name").notNull().default(""),
    sizeBytes: integer("size_bytes").notNull().default(0),
    sha256: text("sha256").notNull().default(""),
    durationMs: integer("duration_ms"),
    /** Position of this recording on the meeting timeline. */
    offsetMs: integer("offset_ms").notNull().default(0),
    /** Call recordings: the call, the person on this track and when its media started (ms). */
    callSessionId: text("call_session_id"),
    speakerUserId: text("speaker_user_id"),
    mediaStartedAt: integer("media_started_at"),
    /** JSON: how consent was obtained (declaration text version, user, time, AI policy). */
    consentEvidence: text("consent_evidence").notNull().default("{}"),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    purgeState: text("purge_state", { enum: meetingPurgeStates }).notNull().default("active"),
    purgedAt: integer("purged_at", { mode: "timestamp_ms" }),
    createdBy: text("created_by").notNull().references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [
    index("meeting_recordings_meeting_idx").on(table.meetingId),
    index("meeting_recordings_expiry_idx").on(table.purgeState, table.expiresAt),
  ],
);

/**
 * A resumable upload. `reservedBytes` (chunks + assembled copy) is held
 * against free disk space until the upload is done or aborted.
 */
export const mediaUploadSessions = sqliteTable(
  "media_upload_sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    meetingId: text("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    declaredBytes: integer("declared_bytes").notNull(),
    reservedBytes: integer("reserved_bytes").notNull(),
    chunkCount: integer("chunk_count").notNull(),
    /** JSON array of received chunk indexes. */
    receivedChunks: text("received_chunks").notNull().default("[]"),
    consentEvidence: text("consent_evidence").notNull(),
    state: text("state", { enum: mediaUploadStates }).notNull().default("uploading"),
    storedName: text("stored_name"),
    sha256: text("sha256"),
    recordingId: text("recording_id"),
    error: text("error").notNull().default(""),
    /** A failed upload the uploader or a host has hidden from the meeting page. */
    dismissedAt: integer("dismissed_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("media_upload_sessions_state_idx").on(table.state, table.expiresAt)],
);

/** Durable work queue; see processing/jobs.ts for the lease protocol. */
export const meetingJobs = sqliteTable(
  "meeting_jobs",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    meetingId: text("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
    recordingId: text("recording_id"),
    transcriptId: text("transcript_id"),
    stage: text("stage", { enum: meetingJobStages }).notNull(),
    inputRevision: integer("input_revision").notNull().default(1),
    policyRevision: integer("policy_revision").notNull(),
    executionKey: text("execution_key").notNull().unique(),
    status: text("status", { enum: meetingJobStatuses }).notNull().default("queued"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(4),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
    claimToken: text("claim_token"),
    leaseUntil: integer("lease_until", { mode: "timestamp_ms" }),
    heartbeatAt: integer("heartbeat_at", { mode: "timestamp_ms" }),
    lastError: text("last_error").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("meeting_jobs_claim_idx").on(table.status, table.nextAttemptAt),
    index("meeting_jobs_meeting_idx").on(table.meetingId),
  ],
);

/** Attachments a job reads; a purge waits for other active jobs listed here. */
export const meetingJobInputs = sqliteTable(
  "meeting_job_inputs",
  {
    jobId: text("job_id").notNull().references(() => meetingJobs.id, { onDelete: "cascade" }),
    recordingId: text("recording_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.jobId, table.recordingId] }), index("meeting_job_inputs_recording_idx").on(table.recordingId)],
);

export const meetingAuditLog = sqliteTable(
  "meeting_audit_log",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    meetingId: text("meeting_id").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    details: text("details").notNull().default("{}"),
    createdAt: createdAt(),
  },
  (table) => [index("meeting_audit_log_meeting_idx").on(table.meetingId, table.createdAt)],
);
