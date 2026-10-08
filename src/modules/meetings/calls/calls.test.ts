import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const mocks = await vi.hoisted(async () => {
  const [{ mkdtempSync }, { join }, { tmpdir }] = await Promise.all([import("node:fs"), import("node:path"), import("node:os")]);
  process.env.UPLOADS_PATH = mkdtempSync(join(tmpdir(), "meeting-calls-test-"));
  process.env.LIVEKIT_EGRESS_DIR = mkdtempSync(join(tmpdir(), "meeting-egress-test-"));
  process.env.LIVEKIT_API_KEY = "key";
  process.env.LIVEKIT_API_SECRET = "secret-secret-secret-secret-secret";
  return {
    requireUserOrThrow: vi.fn(),
    startTrackRecording: vi.fn(),
    stopRecording: vi.fn(),
    createCallRoom: vi.fn(),
    deleteCallRoom: vi.fn(),
    callRoomExists: vi.fn(),
    listCallParticipants: vi.fn(),
    listRoomEgress: vi.fn(),
    probeCallRoom: vi.fn(),
    revalidatePath: vi.fn(),
  };
});
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireUserOrThrow: mocks.requireUserOrThrow }));
vi.mock("./livekit", async (original) => ({
  ...(await original<typeof import("./livekit")>()),
  startTrackRecording: mocks.startTrackRecording,
  stopRecording: mocks.stopRecording,
  createCallRoom: mocks.createCallRoom,
  deleteCallRoom: mocks.deleteCallRoom,
  callRoomExists: mocks.callRoomExists,
  listCallParticipants: mocks.listCallParticipants,
  listRoomEgress: mocks.listRoomEgress,
  probeCallRoom: mocks.probeCallRoom,
}));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("@/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
});

import { EgressInfo, EgressStatus } from "livekit-server-sdk";
import { db, sqlite } from "@/db";
import { endCall, joinCall, startCall } from "../call-actions";
import { setMeetingAccess } from "../meeting-actions";
import { meetingCallSessions, meetingEgressAttempts, meetingJobs, meetingRecordings } from "../schema";
import { host, member, outsider, resetDatabase, seedMeeting } from "../test-helpers";
import { DEAD_ROOM_CHECKS, EMPTY_CALL_MS, MAX_ROOM_CLOSE_ATTEMPTS, MAX_TRACK_ATTEMPTS, ensureTrackRecording, reconcileCalls, syncEgress } from "./recording";

/** What LiveKit answers for a room whose node is gone. */
const unavailable = () => Object.assign(new Error("no response from servers"), { code: "unavailable", status: 503 });

const as = (viewer: { id: string; role: string }) => mocks.requireUserOrThrow.mockResolvedValue({ ...viewer, name: viewer.id });
const session = () => db.select().from(meetingCallSessions).get()!;
const attempts = () => db.select().from(meetingEgressAttempts).all();
let meetingId: string;

beforeEach(() => {
  resetDatabase();
  vi.clearAllMocks();
  for (const mock of [mocks.deleteCallRoom, mocks.probeCallRoom, mocks.stopRecording]) mock.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
  meetingId = seedMeeting({ members: [[host.id, "host"], [member.id, "participant"], [outsider.id, "viewer"]] }).id;
  as(host);
  mocks.callRoomExists.mockResolvedValue(true);
  mocks.listCallParticipants.mockResolvedValue([]);
  mocks.listRoomEgress.mockResolvedValue([]);
  mocks.startTrackRecording.mockImplementation(async (_room: string, _track: string, fileName: string) => new EgressInfo({ egressId: `EG_${fileName}` }));
});
afterAll(() => {
  sqlite.close();
  fs.rmSync(process.env.UPLOADS_PATH!, { recursive: true, force: true });
  fs.rmSync(process.env.LIVEKIT_EGRESS_DIR!, { recursive: true, force: true });
});

async function recordedCallWithMember() {
  expect(await startCall({ meetingId, record: true })).toEqual({ ok: true });
  as(member);
  const joined = await joinCall({ meetingId, consentRecording: true, consentAi: true });
  expect(joined.ok).toBe(true);
  const identity = db.select().from((await import("../schema")).meetingCallEndpoints).get()!.identity;
  return { identity };
}

describe("admission", () => {
  it("issues no token for a recorded call without consent to recording and AI", async () => {
    await startCall({ meetingId, record: true });
    as(member);
    expect(await joinCall({ meetingId })).toEqual({ ok: false, error: "declaration" });
    expect(await joinCall({ meetingId, consentRecording: true })).toEqual({ ok: false, error: "declaration" });
    const joined = await joinCall({ meetingId, consentRecording: true, consentAi: true });
    expect(joined).toMatchObject({ ok: true, record: true, canPublish: true, serverUrl: "/livekit" });
  });

  it("lets viewers listen without publishing, and nobody outside the access list in", async () => {
    await startCall({ meetingId, record: false });
    as(outsider);
    expect(await joinCall({ meetingId })).toMatchObject({ ok: true, canPublish: false });
    db.delete((await import("../schema")).meetingAccess).where(eq((await import("../schema")).meetingAccess.userId, outsider.id)).run();
    expect(await joinCall({ meetingId })).toEqual({ ok: false, error: "notFound" });
  });

  it("ends the call when someone is removed from the meeting", async () => {
    await startCall({ meetingId, record: false });
    expect(await setMeetingAccess({ meetingId, members: [{ userId: host.id, role: "host" }] })).toEqual({ ok: true });
    expect(session()).toMatchObject({ status: "ended", endReason: "accessChanged" });
    expect(mocks.deleteCallRoom).toHaveBeenCalled();
  });

  it("ends the call when someone is demoted to viewer", async () => {
    await startCall({ meetingId, record: false });
    const members = [{ userId: host.id, role: "host" as const }, { userId: member.id, role: "participant" as const }, { userId: outsider.id, role: "viewer" as const }];
    expect(await setMeetingAccess({ meetingId, members })).toEqual({ ok: true });
    expect(session().status).toBe("open");
    expect(await setMeetingAccess({ meetingId, members: members.map((row) => row.userId === member.id ? { ...row, role: "viewer" as const } : row) })).toEqual({ ok: true });
    expect(session()).toMatchObject({ status: "ended", endReason: "accessChanged" });
  });

  it("only lets hosts or the starter end a call", async () => {
    as(member);
    await startCall({ meetingId, record: false });
    as(outsider);
    expect(await endCall(meetingId)).toEqual({ ok: false, error: "forbidden" });
    as(member);
    expect(await endCall(meetingId)).toEqual({ ok: true });
    expect(session().status).toBe("ended");
  });
});

describe("recording", () => {
  it("records each consented track once, even when webhook and reconciler race", async () => {
    const { identity } = await recordedCallWithMember();
    await Promise.all([ensureTrackRecording(session(), identity, "TR_1"), ensureTrackRecording(session(), identity, "TR_1")]);
    expect(mocks.startTrackRecording).toHaveBeenCalledTimes(1);
    expect(attempts()).toMatchObject([{ state: "started", userId: member.id, trackSid: "TR_1" }]);
    await ensureTrackRecording(session(), "unknown-identity", "TR_2");
    expect(mocks.startTrackRecording).toHaveBeenCalledTimes(1);
  });

  it("never records an unrecorded call", async () => {
    await startCall({ meetingId, record: false });
    as(member);
    await joinCall({ meetingId });
    const identity = db.select().from((await import("../schema")).meetingCallEndpoints).get()!.identity;
    await ensureTrackRecording(session(), identity, "TR_1");
    expect(mocks.startTrackRecording).not.toHaveBeenCalled();
  });

  it("does not retry while a start is unknown, and stops a late duplicate", async () => {
    const { identity } = await recordedCallWithMember();
    mocks.startTrackRecording.mockRejectedValueOnce(new Error("timeout"));
    await ensureTrackRecording(session(), identity, "TR_1");
    expect(attempts()).toMatchObject([{ state: "unknown" }]);
    await ensureTrackRecording(session(), identity, "TR_1");
    expect(mocks.startTrackRecording).toHaveBeenCalledTimes(1);
    const first = attempts()[0];
    db.update(meetingEgressAttempts).set({ state: "abandoned" }).where(eq(meetingEgressAttempts.id, first.id)).run();
    await ensureTrackRecording(session(), identity, "TR_1");
    expect(mocks.startTrackRecording).toHaveBeenCalledTimes(2);
    await syncEgress(new EgressInfo({ egressId: "EG_late", status: EgressStatus.EGRESS_ACTIVE, request: { case: "track", value: { roomName: "r", trackId: "TR_1", output: { case: "file", value: { filepath: `/out/${first.fileName}` } } } } }));
    expect(mocks.stopRecording).toHaveBeenCalledWith("EG_late");
    expect(db.select().from(meetingEgressAttempts).where(eq(meetingEgressAttempts.id, first.id)).get()!.state).toBe("duplicate_stopped");
  });

  it("stops restarting a track whose recorder keeps failing", async () => {
    const { identity } = await recordedCallWithMember();
    mocks.startTrackRecording.mockRejectedValue(new Error("invalid request"));
    for (let i = 0; i < MAX_TRACK_ATTEMPTS + 2; i++) await ensureTrackRecording(session(), identity, "TR_1");
    expect(mocks.startTrackRecording).toHaveBeenCalledTimes(MAX_TRACK_ATTEMPTS);
    expect(attempts().every((attempt) => attempt.state === "failed")).toBe(true);
  });

  it("takes a finished recording into the store as the speaker's own track", async () => {
    const { identity } = await recordedCallWithMember();
    await ensureTrackRecording(session(), identity, "TR_1");
    const attempt = attempts()[0];
    fs.writeFileSync(path.join(process.env.LIVEKIT_EGRESS_DIR!, attempt.fileName), Buffer.concat([Buffer.from("OggS"), Buffer.alloc(100, 7)]));
    await syncEgress(new EgressInfo({ egressId: attempt.egressId!, status: EgressStatus.EGRESS_COMPLETE, startedAt: BigInt(1_800_000_000_000) * BigInt(1_000_000) }));
    await reconcileCalls();
    expect(attempts()[0].state).toBe("ingested");
    const recording = db.select().from(meetingRecordings).get()!;
    expect(recording).toMatchObject({ source: "livekit", speakerScope: "single", speakerUserId: member.id, mediaStartedAt: 1_800_000_000_000 });
    // Whose microphone and when it started, in Vienna time.
    expect(recording.fileName).toBe("call-member-2027-01-15-0900.ogg");
    expect(JSON.parse(recording.consentEvidence)).toMatchObject({ type: "callConsent", userId: member.id, aiProcessing: true });
    expect(db.select().from(meetingJobs).all()).toMatchObject([{ stage: "ingest", recordingId: recording.id }]);
    expect(fs.existsSync(path.join(process.env.LIVEKIT_EGRESS_DIR!, attempt.fileName))).toBe(false);
  });
});

describe("ending empty calls", () => {
  it("ends a call nobody from the meeting has been in for ten minutes, ignoring recorders", async () => {
    const { identity } = await recordedCallWithMember();
    const start = Date.now() + 120_000;
    mocks.listCallParticipants.mockResolvedValue([{ identity: "EG_recorder", tracks: [] }]);
    await reconcileCalls(start);
    await reconcileCalls(start + EMPTY_CALL_MS - 1);
    expect(session().status).toBe("open");
    // Someone back in the call starts the wait over.
    mocks.listCallParticipants.mockResolvedValue([{ identity, tracks: [] }]);
    await reconcileCalls(start + EMPTY_CALL_MS);
    mocks.listCallParticipants.mockResolvedValue([]);
    await reconcileCalls(start + EMPTY_CALL_MS + 1);
    await reconcileCalls(start + 2 * EMPTY_CALL_MS);
    expect(session().status).toBe("open");
    await reconcileCalls(start + 2 * EMPTY_CALL_MS + 1);
    expect(session()).toMatchObject({ status: "ended", endReason: "empty" });
    expect(mocks.deleteCallRoom).toHaveBeenCalled();
  });
});

describe("dead rooms", () => {
  it("ends a call whose room only lists recorders and whose node does not answer", async () => {
    await recordedCallWithMember();
    const now = Date.now() + 120_000;
    mocks.listCallParticipants.mockResolvedValue([{ identity: "EG_recorder", tracks: [] }]);
    // A healthy room nobody is in follows the normal ten-minute rule.
    await reconcileCalls(now);
    expect(mocks.probeCallRoom).toHaveBeenCalled();
    expect(session().status).toBe("open");
    mocks.probeCallRoom.mockRejectedValue(unavailable());
    for (let i = 1; i < DEAD_ROOM_CHECKS; i++) await reconcileCalls(now + i * 30_000);
    expect(session().status).toBe("open");
    await reconcileCalls(now + DEAD_ROOM_CHECKS * 30_000);
    expect(session()).toMatchObject({ status: "ended", endReason: "roomDead" });
  });

  it("does not probe a room people are in, and ends one whose listing is unavailable", async () => {
    const { identity } = await recordedCallWithMember();
    const now = Date.now() + 120_000;
    mocks.listCallParticipants.mockResolvedValue([{ identity, tracks: [] }]);
    await reconcileCalls(now);
    expect(mocks.probeCallRoom).not.toHaveBeenCalled();
    mocks.listCallParticipants.mockRejectedValue(unavailable());
    for (let i = 1; i <= DEAD_ROOM_CHECKS; i++) await reconcileCalls(now + i * 30_000);
    expect(session()).toMatchObject({ status: "ended", endReason: "roomDead" });
  });
});

describe("closing rooms", () => {
  it("ends the call and revalidates even when the room cannot be deleted, and retries the deletion", async () => {
    await startCall({ meetingId, record: false });
    mocks.deleteCallRoom.mockRejectedValue(unavailable());
    mocks.revalidatePath.mockClear();
    expect(await endCall(meetingId)).toEqual({ ok: true });
    expect(mocks.revalidatePath).toHaveBeenCalled();
    expect(session()).toMatchObject({ status: "ended", roomClosedAt: null, roomCloseAttempts: 1 });
    // Nobody can rejoin an ended call.
    as(member);
    expect(await joinCall({ meetingId })).toEqual({ ok: false, error: "noCall" });
    mocks.deleteCallRoom.mockResolvedValue(undefined);
    await reconcileCalls();
    expect(mocks.deleteCallRoom).toHaveBeenCalledTimes(2);
    expect(session().roomClosedAt).toBeInstanceOf(Date);
    await reconcileCalls();
    expect(mocks.deleteCallRoom).toHaveBeenCalledTimes(2);
  });

  it("gives up on a room that stays unavailable", async () => {
    await startCall({ meetingId, record: false });
    mocks.deleteCallRoom.mockRejectedValue(unavailable());
    expect(await setMeetingAccess({ meetingId, members: [{ userId: host.id, role: "host" }] })).toEqual({ ok: true });
    for (let i = 0; i < MAX_ROOM_CLOSE_ATTEMPTS + 3; i++) await reconcileCalls();
    expect(mocks.deleteCallRoom).toHaveBeenCalledTimes(MAX_ROOM_CLOSE_ATTEMPTS);
    expect(session()).toMatchObject({ status: "ended", roomCloseAttempts: MAX_ROOM_CLOSE_ATTEMPTS });
    expect(session().roomClosedAt).toBeInstanceOf(Date);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("meeting_call_room_given_up"));
  });

  it("stops the call's recorders even when the room cannot be deleted, and any that still run later", async () => {
    const { identity } = await recordedCallWithMember();
    await ensureTrackRecording(session(), identity, "TR_1");
    const attempt = attempts()[0];
    mocks.deleteCallRoom.mockRejectedValue(unavailable());
    as(host);
    expect(await endCall(meetingId)).toEqual({ ok: true });
    expect(mocks.stopRecording).toHaveBeenCalledWith(attempt.egressId);
    // A recorder that (re)started on its own is stopped by the reconciler.
    mocks.listRoomEgress.mockResolvedValue([new EgressInfo({ egressId: "EG_orphan", status: EgressStatus.EGRESS_ACTIVE })]);
    await reconcileCalls();
    expect(mocks.stopRecording).toHaveBeenCalledWith("EG_orphan");
  });
});
