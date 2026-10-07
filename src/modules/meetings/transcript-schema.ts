import { createId } from "@paralleldrive/cuid2";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "@/db/core-schema";
import { tasks } from "@/modules/projects/schema";
import { actionItemDecisionStatuses, meetingProtocolSources, meetingTranscriptStatuses } from "./constants";

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());

/** Transcript of one recording. Rows and segments are immutable once completed. */
export const meetingTranscripts = sqliteTable(
  "meeting_transcripts",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    meetingId: text("meeting_id").notNull(),
    recordingId: text("recording_id").notNull(),
    revision: integer("revision").notNull(),
    engine: text("engine").notNull(),
    model: text("model").notNull(),
    language: text("language").notNull(),
    status: text("status", { enum: meetingTranscriptStatuses }).notNull().default("pending"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("meeting_transcripts_revision_unique").on(table.recordingId, table.revision),
    index("meeting_transcripts_meeting_idx").on(table.meetingId),
  ],
);

export const meetingTranscriptSegments = sqliteTable(
  "meeting_transcript_segments",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    transcriptId: text("transcript_id").notNull().references(() => meetingTranscripts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    /** Stable within the transcript, e.g. "r1:A". */
    speakerKey: text("speaker_key").notNull(),
    text: text("text").notNull(),
  },
  (table) => [index("meeting_transcript_segments_transcript_idx").on(table.transcriptId, table.position)],
);

/**
 * The meeting-wide transcript: every recording transcript placed on one
 * timeline. A new input always produces a new revision.
 */
export const meetingSessionTranscripts = sqliteTable(
  "meeting_session_transcripts",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    meetingId: text("meeting_id").notNull(),
    revision: integer("revision").notNull(),
    /** JSON: [{ transcriptId, recordingId, offsetMs }] */
    inputManifest: text("input_manifest").notNull(),
    /** JSON: [{ recordingId, reason }] — recordings without a usable transcript. */
    missingInputs: text("missing_inputs").notNull().default("[]"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("meeting_session_transcripts_revision_unique").on(table.meetingId, table.revision)],
);

export const meetingSessionSegments = sqliteTable(
  "meeting_session_segments",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sessionTranscriptId: text("session_transcript_id").notNull().references(() => meetingSessionTranscripts.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
    speakerKey: text("speaker_key").notNull(),
    sourceSegmentId: text("source_segment_id").notNull(),
    text: text("text").notNull(),
    /** Annotation only: a probable echo of another segment. Never deletes evidence. */
    possibleDuplicateOf: text("possible_duplicate_of"),
  },
  (table) => [index("meeting_session_segments_transcript_idx").on(table.sessionTranscriptId, table.position)],
);

/** Who a speaker key is. A remap is a new revision; segments never change. */
export const meetingSpeakerMaps = sqliteTable(
  "meeting_speaker_maps",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sessionTranscriptId: text("session_transcript_id").notNull().references(() => meetingSessionTranscripts.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    /** JSON: { [speakerKey]: { userId: string | null, label: string } } */
    map: text("map").notNull(),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("meeting_speaker_maps_revision_unique").on(table.sessionTranscriptId, table.revision)],
);

/** Append-only protocol versions; approval pins one version and its inputs. */
export const meetingProtocols = sqliteTable(
  "meeting_protocols",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    meetingId: text("meeting_id").notNull(),
    version: integer("version").notNull(),
    sessionTranscriptId: text("session_transcript_id"),
    speakerMapRevision: integer("speaker_map_revision"),
    /** JSON, see protocol-content.ts. */
    content: text("content").notNull(),
    source: text("source", { enum: meetingProtocolSources }).notNull(),
    model: text("model").notNull().default(""),
    promptVersion: integer("prompt_version").notNull().default(0),
    createdBy: text("created_by").references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("meeting_protocols_version_unique").on(table.meetingId, table.version)],
);

/**
 * Acceptance or rejection of an action item of the approved protocol. The
 * snapshot keeps what was accepted even if later versions edit the item.
 */
export const meetingActionItemDecisions = sqliteTable(
  "meeting_action_item_decisions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    meetingId: text("meeting_id").notNull(),
    itemKey: text("item_key").notNull(),
    protocolId: text("protocol_id").notNull(),
    snapshot: text("snapshot").notNull(),
    status: text("status", { enum: actionItemDecisionStatuses }).notNull(),
    taskId: text("task_id").unique().references(() => tasks.id, { onDelete: "set null" }),
    decidedBy: text("decided_by").notNull().references(() => user.id),
    decidedAt: createdAt(),
  },
  (table) => [uniqueIndex("meeting_action_item_decisions_unique").on(table.meetingId, table.itemKey)],
);
