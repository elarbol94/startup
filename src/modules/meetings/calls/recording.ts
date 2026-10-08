import "server-only";

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { and, count, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
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
  isLivekitUnavailable,
  listCallParticipants,
  listRoomEgress,
  livekitConfig,
  probeCallRoom,
  startTrackRecording,
  stopRecording,
} from "./livekit";

type Attempt = typeof meetingEgressAttempts.$inferSelect;
type Session = typeof meetingCallSessions.$inferSelect;

/** How long an attempt with an unknown outcome is looked for before a retry may start. */
const UNKNOWN_RESOLUTION_MS = 3 * 60_000;
const LIVE_STATES = ["calling", "started", "unknown", "complete", "ingested"] as const;
/** States in which a recorder may still be running. */
const RUNNING_STATES = ["calling", "started", "unknown"] as const;
/** Recorder starts per track and call; a track that keeps failing is then left unrecorded. */
export const MAX_TRACK_ATTEMPTS = 3;
/** Room deletions of an ended call, one per reconcile (~30 s), before the room is given up as dead. */
export const MAX_ROOM_CLOSE_ATTEMPTS = 10;
/** Consecutive "unavailable" answers (one per reconcile) after which an open call's room counts as dead. */
export const DEAD_ROOM_CHECKS = 2;

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
    // A track whose recorder keeps failing is not restarted every reconcile forever.
    const tries = tx.select({ n: count() }).from(meetingEgressAttempts).where(and(eq(meetingEgressAttempts.sessionId, session.id), eq(meetingEgressAttempts.trackSid, trackSid))).get();
    if ((tries?.n ?? 0) >= MAX_TRACK_ATTEMPTS) return null;
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

/**
 * Ends a call: marks it ended (so nobody can join any more), stops its
 * recorders and closes the room (disconnecting everyone). LiveKit failures
 * do not throw; the reconciler retries them (see closeEndedCall).
 */
export async function endCallSession(session: Session, reason: string, actorId: string | null) {
  const changed = db.update(meetingCallSessions).set({ status: "ended", endedAt: new Date(), endReason: reason })
    .where(and(eq(meetingCallSessions.id, session.id), eq(meetingCallSessions.status, "open"))).run().changes;
  emptySince.delete(session.id);
  deadChecks.delete(session.id);
  if (changed) {
    audit(db, session.meetingId, actorId, "call.ended", { sessionId: session.id, reason });
    // Transcripts that finished during the call waited for its end (see the merge stage).
    const meeting = db.select({ policyRevision: meetings.policyRevision, aiPolicy: meetings.aiPolicy }).from(meetings).where(eq(meetings.id, session.meetingId)).get();
    if (meeting?.aiPolicy === "openai") {
      enqueueJob(db, { meetingId: session.meetingId, stage: "merge", policyRevision: meeting.policyRevision, executionKey: `merge:call:${session.id}`, delayMs: 5_000 });
    }
  }
  await closeEndedCall(session.id);
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 500);

/**
 * Stops every recorder of an ended call that may still run (known attempts
 * and, when given, listed egresses), then deletes its room. A failed
 * deletion is retried on later reconciles and given up after
 * MAX_ROOM_CLOSE_ATTEMPTS, e.g. for a room left behind on a dead LiveKit node.
 */
async function closeEndedCall(sessionId: string, listed: EgressInfo[] = []) {
  const session = db.select().from(meetingCallSessions).where(eq(meetingCallSessions.id, sessionId)).get();
  if (!session || session.status !== "ended") return;
  const running = new Set(db.select({ egressId: meetingEgressAttempts.egressId }).from(meetingEgressAttempts).where(and(
    eq(meetingEgressAttempts.sessionId, session.id), inArray(meetingEgressAttempts.state, [...RUNNING_STATES]), isNotNull(meetingEgressAttempts.egressId),
  )).all().map((row) => row.egressId!));
  for (const info of listed) {
    if (info.status === EgressStatus.EGRESS_ACTIVE || info.status === EgressStatus.EGRESS_STARTING) running.add(info.egressId);
  }
  for (const egressId of running) {
    try {
      await stopRecording(egressId);
    } catch (error) {
      console.error(JSON.stringify({ event: "meeting_call_egress_stop_failed", sessionId, egressId, error: errorText(error) }));
    }
  }
  if (session.roomClosedAt) return;
  try {
    await deleteCallRoom(session.roomName);
    db.update(meetingCallSessions).set({ roomClosedAt: new Date() }).where(eq(meetingCallSessions.id, session.id)).run();
  } catch (error) {
    const attempts = session.roomCloseAttempts + 1;
    const giveUp = attempts >= MAX_ROOM_CLOSE_ATTEMPTS;
    db.update(meetingCallSessions).set({ roomCloseAttempts: attempts, roomClosedAt: giveUp ? new Date() : null }).where(eq(meetingCallSessions.id, session.id)).run();
    console.error(JSON.stringify({
      event: giveUp ? "meeting_call_room_given_up" : "meeting_call_room_close_failed",
      sessionId, roomName: session.roomName, attempts, deadNode: isLivekitUnavailable(error), error: errorText(error),
    }));
  }
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
/** Consecutive reconciles in which an open call's room answered "unavailable". */
const deadChecks = new Map<string, number>();

async function syncSessionEgress(session: Session, now: number) {
  let listed: EgressInfo[] = [];
  try {
    listed = await listRoomEgress(session.roomName);
    for (const info of listed) await syncEgress(info);
  } catch (error) {
    console.error(JSON.stringify({ event: "meeting_call_egress_list_failed", sessionId: session.id, error: errorText(error) }));
  }
  // Unknown outcomes: give up after the resolution window so the track can be retried.
  db.update(meetingEgressAttempts).set({ state: "abandoned", updatedAt: new Date(now) }).where(and(
    eq(meetingEgressAttempts.sessionId, session.id), eq(meetingEgressAttempts.state, "unknown"), lt(meetingEgressAttempts.calledAt, new Date(now - UNKNOWN_RESOLUTION_MS)),
  )).run();
  return listed;
}

/**
 * The room's participants, or null when there is nothing more to do now.
 * A room counts as dead when LiveKit answers "unavailable" on
 * DEAD_ROOM_CHECKS reconciles in a row: its node is gone (e.g. LiveKit
 * restarted) while Redis still lists the room. Listings come from Redis, so
 * a room nobody from the meeting is in is also probed on its own node.
 */
async function liveParticipants(session: Session, now: number, people: Set<string>) {
  try {
    if (now - session.startedAt.getTime() > 60_000 && !await callRoomExists(session.roomName)) {
      await endCallSession(session, "roomClosed", null);
      return null;
    }
    const participants = await listCallParticipants(session.roomName);
    if (!participants.some((participant) => people.has(participant.identity))) await probeCallRoom(session.roomName);
    deadChecks.delete(session.id);
    return participants;
  } catch (error) {
    if (!isLivekitUnavailable(error)) throw error;
    const checks = (deadChecks.get(session.id) ?? 0) + 1;
    deadChecks.set(session.id, checks);
    if (checks < DEAD_ROOM_CHECKS) return null;
    console.error(JSON.stringify({ event: "meeting_call_room_dead", sessionId: session.id, roomName: session.roomName, error: errorText(error) }));
    await endCallSession(session, "roomDead", null);
    return null;
  }
}

async function reconcileSession(session: Session, now: number) {
  const listed = await syncSessionEgress(session, now);
  if (session.status !== "open") {
    await closeEndedCall(session.id, listed);
    return;
  }
  // Only people who joined through the platform count; recorders and other hidden identities do not.
  const people = new Set(db.select({ identity: meetingCallEndpoints.identity }).from(meetingCallEndpoints)
    .where(eq(meetingCallEndpoints.sessionId, session.id)).all().map((row) => row.identity));
  const participants = await liveParticipants(session, now, people);
  if (!participants) return;
  if (participants.some((participant) => people.has(participant.identity))) emptySince.delete(session.id);
  else {
    const since = emptySince.get(session.id) ?? Math.max(now, session.startedAt.getTime());
    emptySince.set(session.id, since);
    if (now - since >= EMPTY_CALL_MS) {
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
  // Ended calls are revisited while their room is not closed yet, and (every five minutes) while any of their recordings is not settled.
  const unsettled = now - lastFullReconcile > 5 * 60_000
    ? db.selectDistinct({ sessionId: meetingEgressAttempts.sessionId }).from(meetingEgressAttempts)
      .where(inArray(meetingEgressAttempts.state, [...RUNNING_STATES])).all().map((row) => row.sessionId)
    : [];
  if (unsettled.length) lastFullReconcile = now;
  const ended = db.select().from(meetingCallSessions).where(and(
    eq(meetingCallSessions.status, "ended"),
    unsettled.length ? or(isNull(meetingCallSessions.roomClosedAt), inArray(meetingCallSessions.id, unsettled)) : isNull(meetingCallSessions.roomClosedAt),
  )).all();
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
