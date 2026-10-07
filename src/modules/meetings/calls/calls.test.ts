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
  };
});
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUserOrThrow: mocks.requireUserOrThrow }));
vi.mock("./livekit", async (original) => ({
  ...(await original<typeof import("./livekit")>()),
  startTrackRecording: mocks.startTrackRecording,
  stopRecording: mocks.stopRecording,
  createCallRoom: mocks.createCallRoom,
  deleteCallRoom: mocks.deleteCallRoom,
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
import { ensureTrackRecording, reconcileCalls, syncEgress } from "./recording";

const as = (viewer: { id: string; role: string }) => mocks.requireUserOrThrow.mockResolvedValue({ ...viewer, name: viewer.id });
const session = () => db.select().from(meetingCallSessions).get()!;
const attempts = () => db.select().from(meetingEgressAttempts).all();
let meetingId: string;

beforeEach(() => {
  resetDatabase();
  vi.clearAllMocks();
  meetingId = seedMeeting({ members: [[host.id, "host"], [member.id, "participant"], [outsider.id, "viewer"]] }).id;
  as(host);
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
    expect(JSON.parse(recording.consentEvidence)).toMatchObject({ type: "callConsent", userId: member.id, aiProcessing: true });
    expect(db.select().from(meetingJobs).all()).toMatchObject([{ stage: "ingest", recordingId: recording.id }]);
    expect(fs.existsSync(path.join(process.env.LIVEKIT_EGRESS_DIR!, attempt.fileName))).toBe(false);
  });
});
