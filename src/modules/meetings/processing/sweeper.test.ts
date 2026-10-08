import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

await vi.hoisted(async () => {
  const [{ mkdtempSync }, { join }, { tmpdir }] = await Promise.all([import("node:fs"), import("node:path"), import("node:os")]);
  process.env.UPLOADS_PATH = mkdtempSync(join(tmpdir(), "meeting-sweeper-test-"));
  process.env.LIVEKIT_EGRESS_DIR = mkdtempSync(join(tmpdir(), "meeting-sweeper-egress-"));
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
import { getAttachmentAbsolutePath, newStoredName, registerStagedAttachment, STAGING_PATH, UPLOADS_PATH } from "@/lib/files";
import { mediaUploadSessions, meetingCallSessions, meetingEgressAttempts, meetingRecordings, meetings } from "../schema";
import { host, resetDatabase, seedMeeting } from "../test-helpers";
import { DERIVED_STAGING, UPLOAD_STAGING } from "./store";
import { CALL_STAGING, sweepOrphanedMedia } from "./sweeper";

const EGRESS = process.env.LIVEKIT_EGRESS_DIR!;
const DAY = 24 * 60 * 60_000;
const NOW = Date.now();
let meetingId: string;

/** Writes a file and backdates it. */
function write(full: string, ageMs: number, bytes = 100) {
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(bytes, 1));
  const time = new Date(NOW - ageMs);
  fs.utimesSync(full, time, time);
  return full;
}

/** A stored meeting recording attachment, optionally with its recording row. */
function storedFile(owner: string, options: { recording?: boolean; ageMs?: number } = {}) {
  const sha256 = crypto.randomBytes(32).toString("hex");
  const storedName = newStoredName(sha256, ".ogg");
  write(getAttachmentAbsolutePath(storedName), 0);
  const attachment = registerStagedAttachment({ storedName, fileName: "a.ogg", mimeType: "audio/ogg", sizeBytes: 100, sha256 },
    { entityType: "meetingRecording", entityId: owner, userId: host.id });
  db.update(attachments).set({ createdAt: new Date(NOW - (options.ageMs ?? 2 * DAY)) }).where(eq(attachments.id, attachment.id)).run();
  if (options.recording !== false) {
    db.insert(meetingRecordings).values({ meetingId: owner, attachmentId: attachment.id, kind: "audio", createdBy: host.id }).run();
  }
  return { id: attachment.id, file: getAttachmentAbsolutePath(storedName) };
}

function attempt(fileName: string, state: typeof meetingEgressAttempts.$inferInsert["state"]) {
  const session = db.insert(meetingCallSessions).values({ meetingId, roomName: crypto.randomUUID(), record: true, aiPolicy: "openai", startedBy: host.id }).returning().get();
  db.insert(meetingEgressAttempts).values({ sessionId: session.id, trackSid: "TR", identity: "id", userId: host.id, fileName, state }).run();
}

beforeEach(() => {
  resetDatabase();
  for (const directory of [UPLOADS_PATH, EGRESS]) {
    fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
  }
  meetingId = seedMeeting().id;
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});
afterAll(() => {
  sqlite.close();
  fs.rmSync(UPLOADS_PATH, { recursive: true, force: true });
  fs.rmSync(EGRESS, { recursive: true, force: true });
});

describe("orphan sweep", () => {
  it("purges recording files of deleted meetings and unreferenced attachments, but keeps live and young ones", () => {
    const live = storedFile(meetingId);
    const unreferenced = storedFile(meetingId, { recording: false });
    const young = storedFile(meetingId, { recording: false, ageMs: 60 * 60_000 });
    const other = seedMeeting().id;
    const ofDeleted = storedFile(other, { recording: false });
    db.delete(meetings).where(eq(meetings.id, other)).run();
    const result = sweepOrphanedMedia({ now: NOW, egressDir: EGRESS });
    expect(result.store).toEqual({ files: 2, bytes: 200 });
    expect([live, young].every((file) => fs.existsSync(file.file))).toBe(true);
    expect([unreferenced, ofDeleted].some((file) => fs.existsSync(file.file))).toBe(false);
    expect(db.select({ id: attachments.id }).from(attachments).all().map((row) => row.id).sort()).toEqual([live.id, young.id].sort());
    expect(fs.existsSync(path.join(UPLOADS_PATH, ".history"))).toBe(false);
  });

  it("never touches attachments of other modules", () => {
    const sha256 = crypto.randomBytes(32).toString("hex");
    const storedName = newStoredName(sha256, ".pdf");
    write(getAttachmentAbsolutePath(storedName), 10 * DAY);
    const row = registerStagedAttachment({ storedName, fileName: "x.pdf", mimeType: "application/pdf", sizeBytes: 100, sha256 },
      { entityType: "task", entityId: "gone", userId: host.id });
    db.update(attachments).set({ createdAt: new Date(NOW - 10 * DAY) }).where(eq(attachments.id, row.id)).run();
    sweepOrphanedMedia({ now: NOW, egressDir: EGRESS });
    expect(fs.existsSync(getAttachmentAbsolutePath(storedName))).toBe(true);
  });

  it("removes old recorder output that no attempt needs any more", () => {
    const unknown = write(path.join(EGRESS, "orphan1.ogg"), 2 * DAY, 50);
    const ingested = write(path.join(EGRESS, "done1.ogg"), 2 * DAY, 70);
    attempt("done1.ogg", "ingested");
    const pending = write(path.join(EGRESS, "pending1.ogg"), 2 * DAY);
    attempt("pending1.ogg", "complete");
    const fresh = write(path.join(EGRESS, "fresh1.ogg"), 60 * 60_000);
    const foreign = write(path.join(EGRESS, "notes.txt"), 10 * DAY);
    const result = sweepOrphanedMedia({ now: NOW, egressDir: EGRESS });
    expect(result.egress).toEqual({ files: 2, bytes: 120 });
    expect(fs.existsSync(unknown) || fs.existsSync(ingested)).toBe(false);
    expect([pending, fresh, foreign].every((file) => fs.existsSync(file))).toBe(true);
  });

  it("removes stale meeting staging without a live session, after two days only", () => {
    const deadUpload = write(path.join(UPLOAD_STAGING, "dead-session", "0.part"), 3 * DAY);
    fs.utimesSync(path.dirname(deadUpload), new Date(NOW - 3 * DAY), new Date(NOW - 3 * DAY));
    const live = db.insert(mediaUploadSessions).values({
      meetingId, userId: host.id, fileName: "a.mp3", mimeType: "audio/mpeg", declaredBytes: 1, reservedBytes: 2, chunkCount: 1,
      consentEvidence: "{}", expiresAt: new Date(NOW + DAY),
    }).returning().get();
    const liveUpload = write(path.join(UPLOAD_STAGING, live.id, "0.part"), 3 * DAY);
    fs.utimesSync(path.dirname(liveUpload), new Date(NOW - 3 * DAY), new Date(NOW - 3 * DAY));
    const youngUpload = write(path.join(UPLOAD_STAGING, "young-session", "0.part"), DAY);
    const deadDerived = write(path.join(DERIVED_STAGING, "drv_gone.ogg"), 3 * DAY);
    const deadCall = write(path.join(CALL_STAGING, "gone.ogg"), 3 * DAY);
    const liveCall = write(path.join(CALL_STAGING, "live.ogg"), 3 * DAY);
    attempt("live.ogg", "complete");
    const unrelated = write(path.join(STAGING_PATH, "office", "doc.bin"), 10 * DAY);
    const result = sweepOrphanedMedia({ now: NOW, egressDir: EGRESS });
    expect(result.staging).toEqual({ files: 3, bytes: 300 });
    expect([deadUpload, deadDerived, deadCall].some((file) => fs.existsSync(file))).toBe(false);
    expect([liveUpload, youngUpload, liveCall, unrelated].every((file) => fs.existsSync(file))).toBe(true);
  });

  it("leaves the recorder directory alone when calls are not configured", () => {
    const old = write(path.join(EGRESS, "orphan2.ogg"), 5 * DAY);
    expect(sweepOrphanedMedia({ now: NOW }).egress).toEqual({ files: 0, bytes: 0 });
    expect(fs.existsSync(old)).toBe(true);
  });
});
