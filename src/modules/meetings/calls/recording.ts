import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { and, eq, inArray, lt } from "drizzle-orm";
import { EgressStatus, TrackType, type EgressInfo } from "livekit-server-sdk";
import { db } from "@/db";
import { user } from "@/db/schema";
import { timeZone } from "@/i18n/config";
import { getAttachmentAbsolutePath, moveStagedFileIntoStore, newStoredName, registerStagedAttachment, STAGING_PATH } from "@/lib/files";
import {
  meetingCallConsents,
  meetingCallEndpoints,
  meetingCallSessions,
  meetingEgressAttempts,
  meetingRecordings,
  meetings,
} from "../schema";
import { enqueueJob } from "../processing/jobs";
import { audit, retentionExpiry } from "../processing/store";
import {
  callRoomExists,
  deleteCallRoom,
  egressFileName,
  listCallParticipants,
  listRoomEgress,
  livekitConfig,
  startTrackRecording,
  stopRecording,
} from "./livekit";

type Attempt = typeof meetingEgressAttempts.$inferSelect;
type Session = typeof meetingCallSessions.$inferSelect;

/** How long an attempt with an unknown outcome is looked for before a retry may start. */
const UNKNOWN_RESOLUTION_MS = 3 * 60_000;
const LIVE_STATES = ["calling", "started", "unknown", "complete", "ingested"] as const;

const nsToMs = (value: bigint) => Number(value / BigInt(1_000_000));

/**
 * Starts recording an audio track of an admitted device, unless an attempt for
 * that track is already live. The attempt row (with its own file name) is
 * written before LiveKit is called, in a transaction that serialises
 * concurrent callers (webhook and reconciler).
 */
export async function ensureTrackRecording(session: Session, identity: string, trackSid: string) {
  if (!session.record || session.status !== "open") return;
  const attempt = db.transaction((tx) => {
    const endpoint = tx.select().from(meetingCallEndpoints).where(and(eq(meetingCallEndpoints.identity, identity), eq(meetingCallEndpoints.sessionId, session.id))).get();
    if (!endpoint) return null;
    const consent = tx.select().from(meetingCallConsents).where(and(eq(meetingCallConsents.sessionId, session.id), eq(meetingCallConsents.userId, endpoint.userId))).get();
    if (!consent) return null;
    const live = tx.select({ id: meetingEgressAttempts.id }).from(meetingEgressAttempts).where(and(
      eq(meetingEgressAttempts.sessionId, session.id), eq(meetingEgressAttempts.trackSid, trackSid), inArray(meetingEgressAttempts.state, [...LIVE_STATES]),
    )).get();
    if (live) return null;
    const id = crypto.randomUUID();
    return tx.insert(meetingEgressAttempts).values({ id, sessionId: session.id, trackSid, identity, userId: endpoint.userId, fileName: `${id}.ogg` }).returning().get();
  }, { behavior: "immediate" });
  if (!attempt) return;
  try {
    const info = await startTrackRecording(session.roomName, trackSid, attempt.fileName);
    db.update(meetingEgressAttempts).set({ state: "started", egressId: info.egressId, updatedAt: new Date() })
      .where(and(eq(meetingEgressAttempts.id, attempt.id), eq(meetingEgressAttempts.state, "calling"))).run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A refused request is final; a timeout may still have started a recorder.
    const definite = /invalid|not found|permission|unauthori[sz]ed|400|404/i.test(message);
    db.update(meetingEgressAttempts).set({ state: definite ? "failed" : "unknown", error: message.slice(0, 500), updatedAt: new Date() })
      .where(eq(meetingEgressAttempts.id, attempt.id)).run();
  }
}

/** Applies an egress status (from a webhook or a listing) to its attempt. */
export async function syncEgress(info: EgressInfo) {
  const attempt = db.select().from(meetingEgressAttempts).where(eq(meetingEgressAttempts.egressId, info.egressId)).get()
    ?? db.select().from(meetingEgressAttempts).where(eq(meetingEgressAttempts.fileName, egressFileName(info))).get();
  if (!attempt) return;
  if (attempt.state === "abandoned" || attempt.state === "duplicate_stopped") {
    // A recorder we gave up on turned up after all: stop it, its file is discarded.
    if (info.status === EgressStatus.EGRESS_ACTIVE || info.status === EgressStatus.EGRESS_STARTING) await stopRecording(info.egressId);
    db.update(meetingEgressAttempts).set({ state: "duplicate_stopped", egressId: info.egressId, updatedAt: new Date() }).where(eq(meetingEgressAttempts.id, attempt.id)).run();
    return;
  }
  if (attempt.state === "ingested" || attempt.state === "complete") return;
  const file = info.fileResults[0];
  const hasMedia = Boolean(file && file.size > BigInt(0));
  const done = info.status === EgressStatus.EGRESS_COMPLETE || ((info.status === EgressStatus.EGRESS_FAILED || info.status === EgressStatus.EGRESS_ABORTED) && hasMedia);
  const failed = !done && (info.status === EgressStatus.EGRESS_FAILED || info.status === EgressStatus.EGRESS_ABORTED);
  db.update(meetingEgressAttempts).set({
    egressId: info.egressId,
    state: done ? "complete" : failed ? "failed" : "started",
    mediaStartedAt: file?.startedAt ? nsToMs(file.startedAt) : info.startedAt ? nsToMs(info.startedAt) : attempt.mediaStartedAt,
    error: info.error ? info.error.slice(0, 500) : attempt.error,
    updatedAt: new Date(),
  }).where(eq(meetingEgressAttempts.id, attempt.id)).run();
}

/** Ends a call: closes the room (disconnecting everyone) and stops its recordings. */
export async function endCallSession(session: Session, reason: string, actorId: string | null) {
  const changed = db.update(meetingCallSessions).set({ status: "ended", endedAt: new Date(), endReason: reason })
    .where(and(eq(meetingCallSessions.id, session.id), eq(meetingCallSessions.status, "open"))).run().changes;
  if (changed) {
    audit(db, session.meetingId, actorId, "call.ended", { sessionId: session.id, reason });
    // Transcripts that finished during the call waited for its end (see the merge stage).
    const meeting = db.select({ policyRevision: meetings.policyRevision, aiPolicy: meetings.aiPolicy }).from(meetings).where(eq(meetings.id, session.meetingId)).get();
    if (meeting?.aiPolicy === "openai") {
      enqueueJob(db, { meetingId: session.meetingId, stage: "merge", policyRevision: meeting.policyRevision, executionKey: `merge:call:${session.id}`, delayMs: 5_000 });
    }
  }
  await deleteCallRoom(session.roomName);
}

/** Ends every open call of a meeting, e.g. after its access list or AI policy changed. */
export async function endOpenCalls(meetingId: string, reason: string, actorId: string | null) {
  if (!livekitConfig().enabled) return;
  const open = db.select().from(meetingCallSessions).where(and(eq(meetingCallSessions.meetingId, meetingId), eq(meetingCallSessions.status, "open"))).all();
  for (const session of open) await endCallSession(session, reason, actorId);
}

/** A call nobody is in any more ends after this, even if LiveKit keeps the room open. */
export const EMPTY_CALL_MS = 10 * 60_000;
/** When each open call was first seen without people; kept in memory, so a restart starts over. */
const emptySince = new Map<string, number>();

async function reconcileSession(session: Session, now: number) {
  const egresses = await listRoomEgress(session.roomName);
  for (const info of egresses) await syncEgress(info);
  // Unknown outcomes: give up after the resolution window so the track can be retried.
  db.update(meetingEgressAttempts).set({ state: "abandoned", updatedAt: new Date(now) }).where(and(
    eq(meetingEgressAttempts.sessionId, session.id), eq(meetingEgressAttempts.state, "unknown"), lt(meetingEgressAttempts.calledAt, new Date(now - UNKNOWN_RESOLUTION_MS)),
  )).run();
  if (session.status !== "open") return;
  if (now - session.startedAt.getTime() > 60_000 && !await callRoomExists(session.roomName)) {
    await endCallSession(session, "roomClosed", null);
    return;
  }
  const participants = await listCallParticipants(session.roomName);
  // Only people who joined through the platform count; recorders and other hidden identities do not.
  const people = new Set(db.select({ identity: meetingCallEndpoints.identity }).from(meetingCallEndpoints)
    .where(eq(meetingCallEndpoints.sessionId, session.id)).all().map((row) => row.identity));
  if (participants.some((participant) => people.has(participant.identity))) emptySince.delete(session.id);
  else {
    const since = emptySince.get(session.id) ?? Math.max(now, session.startedAt.getTime());
    emptySince.set(session.id, since);
    if (now - since >= EMPTY_CALL_MS) {
      emptySince.delete(session.id);
      await endCallSession(session, "empty", null);
      return;
    }
  }
  if (!session.record) return;
  for (const participant of participants) {
    // Recorders and other non-admitted identities have no endpoint row and are skipped there.
    for (const track of participant.tracks) {
      if (track.type === TrackType.AUDIO) await ensureTrackRecording(session, participant.identity, track.sid);
    }
  }
}

/**
 * Copies a finished recording into the upload store and hands it to the
 * processing pipeline. Same recoverable steps as uploads: (1) remember the
 * stored name, (2) move the verified file, (3) write the rows.
 */
async function ingestAttempt(attempt: Attempt) {
  const config = livekitConfig();
  const source = path.join(config.egressDir, attempt.fileName);
  const session = db.select().from(meetingCallSessions).where(eq(meetingCallSessions.id, attempt.sessionId)).get();
  const meeting = session && db.select().from(meetings).where(eq(meetings.id, session.meetingId)).get();
  if (!session || !meeting) return;
  const staged = path.join(STAGING_PATH, "meeting-calls", attempt.fileName);
  let current = attempt;
  if (!current.storedName) {
    if (!fs.existsSync(source)) {
      db.update(meetingEgressAttempts).set({ state: "failed", error: "Recording file is missing", updatedAt: new Date() }).where(eq(meetingEgressAttempts.id, attempt.id)).run();
      return;
    }
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    const hash = crypto.createHash("sha256");
    await pipeline(fs.createReadStream(source), new Transform({ transform(chunk: Buffer, _encoding, callback) { hash.update(chunk); callback(null, chunk); } }), fs.createWriteStream(staged));
    const handle = fs.openSync(staged, "r");
    try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
    const sha256 = hash.digest("hex");
    current = db.update(meetingEgressAttempts).set({ storedName: newStoredName(sha256, ".ogg"), sha256, updatedAt: new Date() })
      .where(eq(meetingEgressAttempts.id, attempt.id)).returning().get();
  }
  if (fs.existsSync(staged)) moveStagedFileIntoStore(staged, current.storedName!);
  const consent = db.select().from(meetingCallConsents).where(and(eq(meetingCallConsents.sessionId, session.id), eq(meetingCallConsents.userId, attempt.userId))).get();
  const sizeBytes = fs.statSync(getAttachmentAbsolutePath(current.storedName!)).size;
  db.transaction((tx) => {
    const fresh = tx.select().from(meetingEgressAttempts).where(eq(meetingEgressAttempts.id, attempt.id)).get();
    if (fresh?.state !== "complete") return;
    const attachment = registerStagedAttachment(
      { storedName: current.storedName!, fileName: callTrackFileName(tx, attempt), mimeType: "audio/ogg", sizeBytes, sha256: current.sha256! },
      { entityType: "meetingRecording", entityId: meeting.id, userId: attempt.userId },
    );
    const createdAt = new Date();
    const recording = tx.insert(meetingRecordings).values({
      meetingId: meeting.id, attachmentId: attachment.id, kind: "audio", speakerScope: "single", source: "livekit",
      fileName: attachment.fileName, sizeBytes, sha256: current.sha256!, callSessionId: session.id, speakerUserId: attempt.userId,
      mediaStartedAt: attempt.mediaStartedAt, createdBy: attempt.userId, createdAt,
      consentEvidence: JSON.stringify({ type: "callConsent", sessionId: session.id, userId: attempt.userId, givenAt: consent?.givenAt.toISOString() ?? null, textVersion: consent?.textVersion ?? null, aiProcessing: consent?.aiProcessing ?? false }),
      expiresAt: retentionExpiry(createdAt, meeting.audioRetentionDays),
    }).returning().get();
    enqueueJob(tx, {
      meetingId: meeting.id, stage: "ingest", recordingId: recording.id, policyRevision: meeting.policyRevision,
      executionKey: `ingest:${recording.id}`, inputs: [recording.id],
    });
    tx.update(meetingEgressAttempts).set({ state: "ingested", updatedAt: new Date() }).where(eq(meetingEgressAttempts.id, attempt.id)).run();
    if (meeting.status !== "processing" && meeting.status !== "cancelled") {
      tx.update(meetings).set({ status: "processing", updatedAt: new Date() }).where(eq(meetings.id, meeting.id)).run();
    }
    audit(tx, meeting.id, null, "call.recordingStored", { sessionId: session.id, recordingId: recording.id, userId: attempt.userId });
  }, { behavior: "immediate" });
  fs.rmSync(source, { force: true });
}

/** A download name that says whose microphone it is and when it started, e.g. `call-felix-2026-10-07-1803.ogg`. */
function callTrackFileName(tx: Pick<typeof db, "select">, attempt: typeof meetingEgressAttempts.$inferSelect) {
  const name = tx.select({ name: user.name }).from(user).where(eq(user.id, attempt.userId)).get()?.name ?? "";
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "person";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(attempt.mediaStartedAt ?? attempt.calledAt.getTime())).map((part) => [part.type, part.value]));
  return `call-${slug}-${parts.year}-${parts.month}-${parts.day}-${parts.hour}${parts.minute}.ogg`;
}

let lastFullReconcile = 0;

/** Periodic call maintenance, run by the meeting worker. */
export async function reconcileCalls(now = Date.now()) {
  if (!livekitConfig().enabled) return;
  const open = db.select().from(meetingCallSessions).where(eq(meetingCallSessions.status, "open")).all();
  // Ended calls are revisited while any of their recordings is not settled yet.
  const unsettled = now - lastFullReconcile > 5 * 60_000
    ? db.selectDistinct({ sessionId: meetingEgressAttempts.sessionId }).from(meetingEgressAttempts)
      .where(inArray(meetingEgressAttempts.state, ["calling", "started", "unknown"])).all().map((row) => row.sessionId)
    : [];
  if (unsettled.length) lastFullReconcile = now;
  const ended = unsettled.length
    ? db.select().from(meetingCallSessions).where(and(inArray(meetingCallSessions.id, unsettled), eq(meetingCallSessions.status, "ended"))).all()
    : [];
  for (const session of [...open, ...ended]) {
    try {
      await reconcileSession(session, now);
    } catch (error) {
      console.error(JSON.stringify({ event: "meeting_call_reconcile_failed", sessionId: session.id, error: error instanceof Error ? error.message : String(error) }));
    }
  }
  for (const attempt of db.select().from(meetingEgressAttempts).where(eq(meetingEgressAttempts.state, "complete")).all()) {
    try {
      await ingestAttempt(attempt);
    } catch (error) {
      console.error(JSON.stringify({ event: "meeting_call_ingest_failed", attemptId: attempt.id, error: error instanceof Error ? error.message : String(error) }));
    }
  }
}
