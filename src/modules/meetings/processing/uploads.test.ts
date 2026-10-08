import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

await vi.hoisted(async () => {
  const [{ mkdtempSync }, { join }, { tmpdir }] = await Promise.all([import("node:fs"), import("node:path"), import("node:os")]);
  process.env.UPLOADS_PATH = mkdtempSync(join(tmpdir(), "meeting-uploads-test-"));
});
vi.mock("server-only", () => ({}));
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

import { db, sqlite } from "@/db";
import { attachments } from "@/db/schema";
import { getAttachmentAbsolutePath, newStoredName, UPLOADS_PATH } from "@/lib/files";
import { mediaUploadSessions, meetingJobs, meetingRecordings, meetings } from "../schema";
import { host, member, resetDatabase, seedMeeting } from "../test-helpers";
import { cancelUploadSession, createUploadSession, processUploadSessions, requestUploadCompletion, setFreeDiskProbe, writeUploadChunk, type UploadSession } from "./uploads";
import { UPLOAD_STAGING } from "./store";

const GB = 1024 ** 3;
const mp3 = Buffer.concat([Buffer.from("ID3"), crypto.randomBytes(2000)]);
const sha = (bytes: Buffer) => crypto.createHash("sha256").update(bytes).digest("hex");
const stream = (bytes: Buffer) => new Blob([new Uint8Array(bytes)]).stream();
/** A body that runs `midway` after its first part, i.e. while the chunk is being streamed. */
function streamWith(bytes: Buffer, midway: () => void) {
  let step = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (step === 0) controller.enqueue(new Uint8Array(bytes.subarray(0, 1000)));
      else if (step === 1) { midway(); controller.enqueue(new Uint8Array(bytes.subarray(1000))); }
      else controller.close();
      step++;
    },
  });
}
const consent = { participantsInformed: true, aiProcessing: true };
let meetingId: string;

function start(sizeBytes: number, userId = host.id, declaration = consent) {
  return createUploadSession({ meetingId, userId, fileName: "talk.mp3", mimeType: "audio/mpeg", sizeBytes, declaration });
}
const session = (id: string) => db.select().from(mediaUploadSessions).where(eq(mediaUploadSessions.id, id)).get()!;

beforeEach(() => {
  resetDatabase();
  fs.rmSync(UPLOADS_PATH, { recursive: true, force: true });
  meetingId = seedMeeting().id;
  setFreeDiskProbe(() => 100 * GB);
});
afterAll(() => {
  sqlite.close();
  fs.rmSync(UPLOADS_PATH, { recursive: true, force: true });
});

describe("starting an upload", () => {
  it("requires the consent declaration, including AI processing when the meeting uses AI", () => {
    expect(start(100, host.id, { participantsInformed: false, aiProcessing: true })).toEqual({ ok: false, error: "declaration" });
    expect(start(100, host.id, { participantsInformed: true, aiProcessing: false })).toEqual({ ok: false, error: "declaration" });
    db.update(meetings).set({ aiPolicy: "none" }).where(eq(meetings.id, meetingId)).run();
    const result = start(100, host.id, { participantsInformed: true, aiProcessing: false });
    expect(result.ok).toBe(true);
    expect(JSON.parse((result as { session: UploadSession }).session.consentEvidence)).toMatchObject({ participantsInformed: true, aiPolicy: "none", userId: host.id });
  });

  it("rejects unknown types and oversized files before accepting bytes", () => {
    expect(createUploadSession({ meetingId, userId: host.id, fileName: "x.html", mimeType: "text/html", sizeBytes: 10, declaration: consent })).toEqual({ ok: false, error: "type" });
    expect(start(5 * GB)).toEqual({ ok: false, error: "tooLarge" });
  });

  it("reserves twice the size against free disk, so concurrent uploads cannot overbook it", () => {
    setFreeDiskProbe(() => 10 * GB);
    expect(start(3 * GB).ok).toBe(true); // reserves 6 GB; 10 - 0 ≥ 6 + 2
    expect(start(1 * GB, member.id).ok).toBe(true); // reserves 2 GB; 10 - 6 ≥ 2 + 2
    expect(start(1 * GB, member.id)).toEqual({ ok: false, error: "disk" }); // 10 - 8 < 2 + 2
  });

  it("limits the reservations one person may hold", () => {
    expect(start(3 * GB).ok).toBe(true);
    expect(start(3 * GB)).toEqual({ ok: false, error: "quota" });
  });
});

describe("chunks and completion", () => {
  it("rejects a chunk whose size or hash does not match", async () => {
    const created = start(mp3.length);
    if (!created.ok) throw new Error(created.error);
    expect(await writeUploadChunk(created.session, 0, stream(mp3.subarray(0, 100)), sha(mp3.subarray(0, 100)))).toBe("chunk");
    expect(await writeUploadChunk(created.session, 0, stream(mp3), sha(Buffer.from("other")))).toBe("chunk");
    expect(requestUploadCompletion(session(created.session.id))).toBe("chunk");
  });

  it("assembles in the background and registers the recording with an ingest job", async () => {
    const created = start(mp3.length);
    if (!created.ok) throw new Error(created.error);
    expect(await writeUploadChunk(created.session, 0, stream(mp3), sha(mp3))).toBeNull();
    expect(requestUploadCompletion(session(created.session.id))).toBeNull();
    await processUploadSessions();
    const done = session(created.session.id);
    expect(done.state).toBe("done");
    const recording = db.select().from(meetingRecordings).where(eq(meetingRecordings.id, done.recordingId!)).get()!;
    expect(recording).toMatchObject({ kind: "audio", sha256: sha(mp3), source: "upload" });
    expect(recording.expiresAt).toBeInstanceOf(Date);
    expect(JSON.parse(recording.consentEvidence)).toMatchObject({ participantsInformed: true, aiProcessing: true });
    const attachment = db.select().from(attachments).where(eq(attachments.id, recording.attachmentId!)).get()!;
    expect(fs.readFileSync(getAttachmentAbsolutePath(attachment.storedName)).equals(mp3)).toBe(true);
    expect(db.select().from(meetingJobs).all()).toMatchObject([{ stage: "ingest", recordingId: recording.id }]);
    expect(db.select().from(meetings).get()!.status).toBe("processing");
    expect(fs.existsSync(path.join(UPLOAD_STAGING, created.session.id))).toBe(false);
  });

  it("aborts an upload whose content does not match its declared type", async () => {
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    const created = start(html.length);
    if (!created.ok) throw new Error(created.error);
    await writeUploadChunk(created.session, 0, stream(html), sha(html));
    requestUploadCompletion(session(created.session.id));
    await processUploadSessions();
    expect(session(created.session.id).state).toBe("aborted");
    expect(db.select().from(meetingRecordings).all()).toHaveLength(0);
  });

  it("finishes a finalisation interrupted between moving the file and writing the rows", async () => {
    const created = start(mp3.length);
    if (!created.ok) throw new Error(created.error);
    const storedName = newStoredName(sha(mp3), ".mp3");
    fs.mkdirSync(path.dirname(getAttachmentAbsolutePath(storedName)), { recursive: true });
    fs.writeFileSync(getAttachmentAbsolutePath(storedName), mp3);
    db.update(mediaUploadSessions).set({ state: "finalizing", storedName, sha256: sha(mp3), receivedChunks: "[0]" })
      .where(eq(mediaUploadSessions.id, created.session.id)).run();
    await processUploadSessions();
    await processUploadSessions();
    expect(session(created.session.id).state).toBe("done");
    expect(db.select().from(meetingRecordings).all()).toHaveLength(1);
    expect(db.select().from(attachments).all()).toMatchObject([{ storedName }]);
  });

  it("cancels an unfinished upload at once, releasing its reservation", async () => {
    const created = start(mp3.length);
    if (!created.ok) throw new Error(created.error);
    await writeUploadChunk(created.session, 0, stream(mp3), sha(mp3));
    expect(cancelUploadSession(session(created.session.id))).toBeNull();
    expect(session(created.session.id)).toMatchObject({ state: "aborted", error: "" });
    expect(fs.existsSync(path.join(UPLOAD_STAGING, created.session.id))).toBe(false);
    expect(cancelUploadSession(session(created.session.id))).toBe("state");
  });

  it("does not cancel an upload the worker is already assembling", () => {
    const created = start(mp3.length);
    if (!created.ok) throw new Error(created.error);
    db.update(mediaUploadSessions).set({ state: "assembling" }).where(eq(mediaUploadSessions.id, created.session.id)).run();
    expect(cancelUploadSession(session(created.session.id))).toBe("state");
    expect(session(created.session.id).state).toBe("assembling");
  });

  it("refuses a chunk whose session was cancelled while it streamed, without a server error", async () => {
    const created = start(mp3.length);
    if (!created.ok) throw new Error(created.error);
    const result = await writeUploadChunk(created.session, 0, streamWith(mp3, () => cancelUploadSession(session(created.session.id))), sha(mp3));
    expect(result).toBe("state");
    expect(session(created.session.id)).toMatchObject({ state: "aborted", receivedChunks: "[]" });
    expect(fs.existsSync(path.join(UPLOAD_STAGING, created.session.id))).toBe(false);
  });

  it("does not replace a chunk once assembly started while it streamed", async () => {
    const created = start(mp3.length);
    if (!created.ok) throw new Error(created.error);
    expect(await writeUploadChunk(created.session, 0, stream(mp3), sha(mp3))).toBeNull();
    const dir = path.join(UPLOAD_STAGING, created.session.id);
    const before = fs.statSync(path.join(dir, "0.part")).mtimeMs;
    const snapshot = session(created.session.id);
    const result = await writeUploadChunk(snapshot, 0, streamWith(mp3, () => requestUploadCompletion(session(created.session.id))), sha(mp3));
    expect(result).toBe("state");
    expect(session(created.session.id).state).toBe("assembling");
    expect(fs.readdirSync(dir)).toEqual(["0.part"]);
    expect(fs.statSync(path.join(dir, "0.part")).mtimeMs).toBe(before);
  });

  it("aborts expired uploads and removes their chunks", async () => {
    const created = start(mp3.length);
    if (!created.ok) throw new Error(created.error);
    await writeUploadChunk(created.session, 0, stream(mp3), sha(mp3));
    db.update(mediaUploadSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(mediaUploadSessions.id, created.session.id)).run();
    await processUploadSessions();
    expect(session(created.session.id).state).toBe("aborted");
    expect(fs.existsSync(path.join(UPLOAD_STAGING, created.session.id))).toBe(false);
    expect(await writeUploadChunk(session(created.session.id), 0, stream(mp3), sha(mp3))).toBe("state");
  });
});

