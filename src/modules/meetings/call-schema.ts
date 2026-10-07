import { createId } from "@paralleldrive/cuid2";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "@/db/core-schema";

const createdAt = () => integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date());

export const meetingSessionStatuses = ["open", "ended"] as const;
export const egressAttemptStates = ["calling", "started", "unknown", "complete", "failed", "abandoned", "duplicate_stopped", "ingested"] as const;
export type EgressAttemptState = (typeof egressAttemptStates)[number];

/**
 * One online call of a meeting, in its own LiveKit room. Whether it is
 * recorded is fixed when the call starts: everyone admitted to a recorded
 * call consented to exactly that before receiving a join token.
 */
export const meetingCallSessions = sqliteTable(
  "meeting_call_sessions",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    meetingId: text("meeting_id").notNull(),
    roomName: text("room_name").notNull().unique(),
    status: text("status", { enum: meetingSessionStatuses }).notNull().default("open"),
    record: integer("record", { mode: "boolean" }).notNull(),
    /** AI policy the consent covered; a policy change ends the call. */
    aiPolicy: text("ai_policy").notNull(),
    startedBy: text("started_by").notNull().references(() => user.id),
    startedAt: createdAt(),
    endedAt: integer("ended_at", { mode: "timestamp_ms" }),
    endReason: text("end_reason").notNull().default(""),
  },
  (table) => [index("meeting_call_sessions_meeting_idx").on(table.meetingId, table.status)],
);

/** Consent of one person to one recorded call, given before their token was issued. */
export const meetingCallConsents = sqliteTable(
  "meeting_call_consents",
  {
    sessionId: text("session_id").notNull().references(() => meetingCallSessions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id),
    textVersion: integer("text_version").notNull(),
    aiProcessing: integer("ai_processing", { mode: "boolean" }).notNull(),
    givenAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.userId] })],
);

/** A device of a person in a call; LiveKit identities are per device, not per person. */
export const meetingCallEndpoints = sqliteTable(
  "meeting_call_endpoints",
  {
    identity: text("identity").primaryKey(),
    sessionId: text("session_id").notNull().references(() => meetingCallSessions.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id),
    createdAt: createdAt(),
  },
  (table) => [index("meeting_call_endpoints_session_idx").on(table.sessionId)],
);

/**
 * One StartTrackEgress call for one audio track. Persisted before the call;
 * each attempt writes its own file, so an attempt whose outcome was unknown
 * can never collide with a retry.
 */
export const meetingEgressAttempts = sqliteTable(
  "meeting_egress_attempts",
  {
    id: text("id").primaryKey().$defaultFn(() => createId()),
    sessionId: text("session_id").notNull().references(() => meetingCallSessions.id, { onDelete: "cascade" }),
    trackSid: text("track_sid").notNull(),
    identity: text("identity").notNull(),
    userId: text("user_id").notNull(),
    fileName: text("file_name").notNull(),
    state: text("state", { enum: egressAttemptStates }).notNull().default("calling"),
    egressId: text("egress_id").unique(),
    /** Wall-clock start of the recorded media (ms), from the egress result. */
    mediaStartedAt: integer("media_started_at"),
    storedName: text("stored_name"),
    sha256: text("sha256"),
    error: text("error").notNull().default(""),
    calledAt: createdAt(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  },
  (table) => [index("meeting_egress_attempts_session_idx").on(table.sessionId, table.trackSid)],
);

/** LiveKit webhook ids already processed (webhooks may be delivered twice). */
export const meetingWebhookEvents = sqliteTable("meeting_webhook_events", {
  eventId: text("event_id").primaryKey(),
  receivedAt: createdAt(),
});
