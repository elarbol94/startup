import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const auth = await vi.hoisted(async () => {
  const [{ mkdtempSync }, { join }, { tmpdir }] = await Promise.all([import("node:fs"), import("node:path"), import("node:os")]);
  process.env.UPLOADS_PATH = mkdtempSync(join(tmpdir(), "meetings-test-"));
  process.env.LIVEKIT_EGRESS_DIR = mkdtempSync(join(tmpdir(), "meetings-egress-test-"));
  process.env.MEETINGS_FAKE_AI = "1";
  return { requireUserOrThrow: vi.fn() };
});
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => auth);
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
import { attachments, projectColumns, projects, taskAssignees, tasks } from "@/db/schema";
import { attachmentAccessError } from "@/lib/attachment-access";
import { getAttachmentAbsolutePath, newStoredName, registerStagedAttachment, UPLOADS_PATH } from "@/lib/files";
import { decideActionItem } from "./action-item-actions";
import { createMeeting, deleteMeeting, retryMeetingJob, setMeetingAccess, setMeetingAiPolicy } from "./meeting-actions";
import { enqueueJob } from "./processing/jobs";
import { sweepOrphanedMedia } from "./processing/sweeper";
import { createUploadSession, setFreeDiskProbe } from "./processing/uploads";
import { requestRecordingPurge, runMeetingWorkerTick, scheduleRetentionPurges } from "./processing/worker";
import { approveProtocol, saveProtocolVersion, saveSpeakerMap } from "./protocol-actions";
import { dismissFailedUpload } from "./upload-actions";
import { getMeetingDetail, searchMeetings } from "./queries";
import {
  mediaUploadSessions,
  meetingActionItemDecisions,
  meetingJobInputs,
  meetingJobs,
  meetingProtocols,
  meetingRecordings,
  meetings,
  meetingSessionSegments,
} from "./schema";
import { host, member, outsider, resetDatabase, seedMeeting } from "./test-helpers";

const as = (viewer: { id: string; role: string }) => auth.requireUserOrThrow.mockResolvedValue(viewer);
const meetingRow = (id: string) => db.select().from(meetings).where(eq(meetings.id, id)).get()!;

/** A stored audio file plus its derived recording, as after ingest + extract. */
function seedAudio(meetingId: string) {
  const bytes = Buffer.concat([Buffer.from("OggS"), crypto.randomBytes(500)]);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const storedName = newStoredName(sha256, ".ogg");
  fs.mkdirSync(path.dirname(getAttachmentAbsolutePath(storedName)), { recursive: true });
  fs.writeFileSync(getAttachmentAbsolutePath(storedName), bytes);
  const attachment = registerStagedAttachment({ storedName, fileName: "a.ogg", mimeType: "audio/ogg", sizeBytes: bytes.length, sha256 }, { entityType: "meetingRecording", entityId: meetingId, userId: host.id });
  const original = db.insert(meetingRecordings).values({ meetingId, attachmentId: attachment.id, kind: "audio", fileName: "a.ogg", durationMs: 12_000, createdBy: host.id }).returning().get();
  const derived = db.insert(meetingRecordings).values({ meetingId, sourceRecordingId: original.id, attachmentId: attachment.id, kind: "derived_audio", fileName: "a.ogg", durationMs: 12_000, createdBy: host.id }).returning().get();
  return { original, derived, attachment };
}

/** Runs transcription → merge → protocol with the fake AI engine. */
async function processMeeting(meetingId: string) {
  const { derived, original, attachment } = seedAudio(meetingId);
  enqueueJob(db, { meetingId, stage: "transcribe", recordingId: derived.id, policyRevision: meetingRow(meetingId).policyRevision, executionKey: `t:${derived.id}`, inputs: [derived.id] });
  await runMeetingWorkerTick();
  return { derived, original, attachment };
}

let meetingId: string;
beforeEach(() => {
  resetDatabase();
  meetingId = seedMeeting().id;
  as(host);
});
afterAll(() => {
  sqlite.close();
  fs.rmSync(UPLOADS_PATH, { recursive: true, force: true });
  fs.rmSync(process.env.LIVEKIT_EGRESS_DIR!, { recursive: true, force: true });
});

describe("processing pipeline", () => {
  it("turns a transcribed recording into a searchable transcript and an evidence-backed draft", async () => {
    await processMeeting(meetingId);
    const detail = getMeetingDetail(host, meetingId)!;
    expect(detail.meeting.status).toBe("review");
    expect(detail.transcript!.segments).toHaveLength(3);
    expect(detail.transcript!.segments[0].speakerKey).toBe("r1:SPK1");
    const protocol = detail.currentProtocol!;
    expect(protocol).toMatchObject({ version: 1, source: "ai" });
    const segmentIds = new Set(detail.transcript!.segments.map((segment) => segment.id));
    expect(protocol.content.decisions[0].evidence.every((id) => segmentIds.has(id))).toBe(true);
    expect(db.select().from(meetingJobs).all().every((job) => job.status === "done")).toBe(true);
    expect(searchMeetings(member, "Förderung")).toMatchObject([{ meetingId, source: "transcript" }]);
  });

  it("does nothing with AI when the meeting's policy is off", async () => {
    db.update(meetings).set({ aiPolicy: "none" }).where(eq(meetings.id, meetingId)).run();
    await processMeeting(meetingId);
    expect(db.select().from(meetingJobs).all()).toMatchObject([{ stage: "transcribe", status: "failed" }]);
    expect(getMeetingDetail(host, meetingId)!.transcript).toBeNull();
  });
});

describe("access", () => {
  it("keeps meetings, files and search results to the access list, even for admins", async () => {
    const { attachment } = await processMeeting(meetingId);
    expect(getMeetingDetail(outsider, meetingId)).toBeNull();
    expect(searchMeetings(outsider, "Förderung")).toEqual([]);
    expect(attachmentAccessError(outsider, "meetingRecording", meetingId, "read")).toBe(404);
    expect(attachmentAccessError(member, "meetingRecording", meetingId, "read")).toBeNull();
    // The generic file API would keep a .history copy; recordings are purged by the module only.
    expect(attachmentAccessError(host, "meetingRecording", attachment.entityId, "delete")).toBe(403);
  });

  it("only lets hosts change access and always keeps a host", async () => {
    as(member);
    expect(await setMeetingAccess({ meetingId, members: [{ userId: member.id, role: "host" }] })).toEqual({ ok: false, error: "forbidden" });
    as(host);
    expect(await setMeetingAccess({ meetingId, members: [{ userId: host.id, role: "participant" }] })).toEqual({ ok: false, error: "lastHost" });
    as(outsider);
    expect(await setMeetingAccess({ meetingId, members: [{ userId: outsider.id, role: "host" }] })).toEqual({ ok: false, error: "notFound" });
  });

  it("starts confidential meetings without AI", async () => {
    const result = await createMeeting({ title: "Personalgespräch", confidential: true, participantIds: [member.id] });
    if (!result.ok) throw new Error(result.error);
    expect(meetingRow(result.meetingId)).toMatchObject({ aiPolicy: "none", confidential: true });
  });
});

describe("approval and action items", () => {
  async function approvedMeeting() {
    await processMeeting(meetingId);
    const protocolId = meetingRow(meetingId).currentProtocolId!;
    expect(await approveProtocol({ meetingId, protocolId })).toEqual({ ok: true });
    return protocolId;
  }

  it("lets only hosts approve, and only the current version", async () => {
    await processMeeting(meetingId);
    const first = meetingRow(meetingId).currentProtocolId!;
    as(member);
    expect(await approveProtocol({ meetingId, protocolId: first })).toEqual({ ok: false, error: "forbidden" });
    const edited = await saveProtocolVersion({ meetingId, baseProtocolId: first, content: { summary: "Neu" } });
    expect(edited.ok).toBe(true);
    expect(await saveProtocolVersion({ meetingId, baseProtocolId: first, content: { summary: "Parallel" } })).toEqual({ ok: false, error: "stale" });
    as(host);
    expect(await approveProtocol({ meetingId, protocolId: first })).toEqual({ ok: false, error: "stale" });
    expect(await approveProtocol({ meetingId, protocolId: (edited as { protocolId: string }).protocolId })).toEqual({ ok: true });
    expect(meetingRow(meetingId).status).toBe("approved");
    expect(searchMeetings(host, "Neu")).toMatchObject([{ source: "protocol" }]);
  });

  it("refuses action items before approval", async () => {
    await processMeeting(meetingId);
    const protocolId = meetingRow(meetingId).currentProtocolId!;
    expect(await decideActionItem({ meetingId, protocolId, itemKey: "t1", accept: true, task: { title: "X", projectId: null, assigneeIds: [], dueDate: null } }))
      .toEqual({ ok: false, error: "notApproved" });
  });

  it("creates exactly one task per item and keeps it when later drafts change the item", async () => {
    const protocolId = await approvedMeeting();
    const project = db.insert(projects).values({ name: "Förderung", createdBy: host.id }).returning().get();
    db.insert(projectColumns).values({ projectId: project.id, name: "Offen" }).run();
    const task = { title: "Antrag senden", projectId: project.id, assigneeIds: [member.id], dueDate: "2026-10-30" };
    const [first, second] = await Promise.all([
      decideActionItem({ meetingId, protocolId, itemKey: "t1", accept: true, task }),
      decideActionItem({ meetingId, protocolId, itemKey: "t1", accept: true, task }),
    ]);
    expect(first.ok && second.ok && first.taskId === second.taskId).toBe(true);
    expect(db.select().from(tasks).all()).toMatchObject([{ title: "Antrag senden", projectId: project.id, dueDate: "2026-10-30" }]);
    expect(db.select().from(taskAssignees).all()).toMatchObject([{ userId: member.id }]);

    const draft = await saveProtocolVersion({ meetingId, baseProtocolId: protocolId, content: {
      actionItems: [{ itemKey: "t1", text: "Etwas ganz anderes", assigneeUserId: null, dueDate: null, evidence: [] }],
    } });
    expect(draft.ok).toBe(true);
    const decision = db.select().from(meetingActionItemDecisions).get()!;
    expect(decision.protocolId).toBe(protocolId);
    expect(JSON.parse(decision.snapshot).item.text).toBe("Antrag an das Land schicken");
    expect(await decideActionItem({ meetingId, protocolId: (draft as { protocolId: string }).protocolId, itemKey: "t2", accept: false })).toEqual({ ok: false, error: "notApproved" });
  });

  it("names speakers as new revisions without touching segments", async () => {
    await processMeeting(meetingId);
    const detail = getMeetingDetail(host, meetingId)!;
    const before = db.select().from(meetingSessionSegments).all();
    expect(await saveSpeakerMap({ sessionTranscriptId: detail.transcript!.id, baseRevision: 1, map: { "r1:SPK1": { userId: host.id, label: "host" } } })).toEqual({ ok: true });
    expect(await saveSpeakerMap({ sessionTranscriptId: detail.transcript!.id, baseRevision: 1, map: {} })).toEqual({ ok: false, error: "stale" });
    expect(await saveSpeakerMap({ sessionTranscriptId: detail.transcript!.id, baseRevision: 2, map: { x: { userId: outsider.id, label: "" } } })).toEqual({ ok: false, error: "invalid" });
    expect(db.select().from(meetingSessionSegments).all()).toEqual(before);
    expect(getMeetingDetail(host, meetingId)!.transcript!.speakerMap["r1:SPK1"].label).toBe("host");
  });
});

describe("AI policy", () => {
  it("cancels pending AI work when turned off and needs a new declaration to turn on again", async () => {
    const { derived } = seedAudio(meetingId);
    enqueueJob(db, { meetingId, stage: "transcribe", recordingId: derived.id, policyRevision: 1, executionKey: "pending" });
    expect(await setMeetingAiPolicy({ meetingId, aiPolicy: "none", confidential: false })).toEqual({ ok: true });
    expect(db.select().from(meetingJobs).all()).toMatchObject([{ status: "cancelled" }]);
    expect(meetingRow(meetingId).policyRevision).toBe(2);
    expect(await setMeetingAiPolicy({ meetingId, aiPolicy: "openai", confidential: false })).toEqual({ ok: false, error: "declaration" });
    expect(await setMeetingAiPolicy({ meetingId, aiPolicy: "openai", confidential: false, aiDeclaration: true })).toEqual({ ok: true });
    expect(db.select().from(meetingJobs).all().filter((job) => job.status === "queued")).toMatchObject([{ stage: "transcribe", policyRevision: 3 }]);
  });

  it("needs the declaration for an upload still in flight that was declared without AI", async () => {
    const quiet = seedMeeting({ aiPolicy: "none" }).id;
    setFreeDiskProbe(() => 100 * 1024 ** 3);
    const upload = createUploadSession({ meetingId: quiet, userId: host.id, fileName: "a.mp3", mimeType: "audio/mpeg", sizeBytes: 100, declaration: { participantsInformed: true, aiProcessing: false } });
    expect(upload.ok).toBe(true);
    expect(getMeetingDetail(host, quiet)!.hasMedia).toBe(true);
    expect(await setMeetingAiPolicy({ meetingId: quiet, aiPolicy: "openai", confidential: false })).toEqual({ ok: false, error: "declaration" });
    expect(meetingRow(quiet).aiPolicy).toBe("none");
  });
});

describe("meeting status", () => {
  it("leaves processing when the last pipeline job fails, and returns to it on retry", async () => {
    db.update(meetings).set({ status: "processing" }).where(eq(meetings.id, meetingId)).run();
    const broken = db.insert(meetingRecordings).values({ meetingId, kind: "audio", fileName: "gone.mp3", createdBy: host.id }).returning().get();
    const job = enqueueJob(db, { meetingId, stage: "ingest", recordingId: broken.id, policyRevision: 1, executionKey: "ingest:gone", inputs: [broken.id] })!;
    await runMeetingWorkerTick();
    expect(db.select().from(meetingJobs).where(eq(meetingJobs.id, job.id)).get()!.status).toBe("failed");
    expect(meetingRow(meetingId).status).toBe("review");
    expect(await retryMeetingJob(job.id)).toEqual({ ok: true });
    expect(meetingRow(meetingId).status).toBe("processing");
  });
});

describe("retention and deletion", () => {
  it("purges media permanently, without a .history copy, and cancels failed work on it", async () => {
    const { original, derived, attachment } = seedAudio(meetingId);
    const file = getAttachmentAbsolutePath(attachment.storedName);
    const failed = enqueueJob(db, { meetingId, stage: "transcribe", recordingId: derived.id, policyRevision: 1, executionKey: "failed", inputs: [original.id] })!;
    db.update(meetingJobs).set({ status: "failed" }).where(eq(meetingJobs.id, failed.id)).run();
    db.update(meetingRecordings).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(meetingRecordings.id, original.id)).run();
    scheduleRetentionPurges();
    await runMeetingWorkerTick();
    expect(db.select().from(meetingJobs).where(eq(meetingJobs.id, failed.id)).get()!.status).toBe("cancelled");
    expect(db.select().from(meetingRecordings).where(eq(meetingRecordings.id, original.id)).get()).toMatchObject({ purgeState: "purged", attachmentId: null });
    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(path.join(UPLOADS_PATH, ".history"))).toBe(false);
    expect(db.select().from(attachments).where(eq(attachments.id, attachment.id)).get()).toBeUndefined();
    expect(db.select().from(meetingJobInputs).all().length).toBeGreaterThan(0);
  });

  it("gives recordings without an expiry date one, so retention still applies", () => {
    const undated = db.insert(meetingRecordings).values({ meetingId, kind: "video", fileName: "v.mp4", createdBy: host.id }).returning().get();
    scheduleRetentionPurges();
    const expiresAt = db.select().from(meetingRecordings).where(eq(meetingRecordings.id, undated.id)).get()!.expiresAt!;
    expect(expiresAt.getTime() - undated.createdAt.getTime()).toBe(meetingRow(meetingId).videoRetentionDays * 24 * 60 * 60_000);
  });

  it("reports a failed unlink as purge_failed, never as purged", async () => {
    const { original, attachment } = seedAudio(meetingId);
    const file = getAttachmentAbsolutePath(attachment.storedName);
    fs.rmSync(file);
    fs.mkdirSync(path.join(file, "blocker"), { recursive: true });
    requestRecordingPurge(original.id, host.id, "test");
    await runMeetingWorkerTick();
    expect(db.select().from(meetingRecordings).where(eq(meetingRecordings.id, original.id)).get()!.purgeState).toBe("purge_failed");
    fs.rmSync(file, { recursive: true, force: true });
  });

  it("deletes a meeting with its files, but not while it is processing", async () => {
    const { attachment } = await processMeeting(meetingId);
    db.insert(meetingJobs).values({ meetingId, stage: "protocol", policyRevision: 1, executionKey: "busy", status: "running" }).run();
    expect(await deleteMeeting(meetingId)).toEqual({ ok: false, error: "busy" });
    db.delete(meetingJobs).where(eq(meetingJobs.executionKey, "busy")).run();
    expect(await deleteMeeting(meetingId)).toEqual({ ok: true });
    expect(fs.existsSync(getAttachmentAbsolutePath(attachment.storedName))).toBe(false);
    expect(db.select().from(meetingProtocols).all()).toEqual([]);
    expect(searchMeetings(host, "Förderung")).toEqual([]);
  });

  it("keeps files when the deletion rolls back, and removes them only after the commit", async () => {
    const { attachment } = seedAudio(meetingId);
    const file = getAttachmentAbsolutePath(attachment.storedName);
    sqlite.exec("CREATE TEMP TRIGGER refuse_delete BEFORE DELETE ON meetings BEGIN SELECT RAISE(ABORT, 'refused'); END");
    try {
      await expect(deleteMeeting(meetingId)).rejects.toThrow("refused");
    } finally {
      sqlite.exec("DROP TRIGGER refuse_delete");
    }
    expect(fs.existsSync(file)).toBe(true);
    expect(db.select().from(attachments).where(eq(attachments.id, attachment.id)).get()).toBeDefined();
    expect(await deleteMeeting(meetingId)).toEqual({ ok: true });
    expect(fs.existsSync(file)).toBe(false);
    expect(db.select().from(attachments).all()).toEqual([]);
  });

  it("removes upload files not yet registered, and leaves a failed unlink to the orphan sweep", async () => {
    const { attachment } = seedAudio(meetingId);
    const file = getAttachmentAbsolutePath(attachment.storedName);
    fs.rmSync(file);
    fs.mkdirSync(path.join(file, "blocker"), { recursive: true });
    const storedName = newStoredName(crypto.randomBytes(32).toString("hex"), ".mp3");
    const moved = getAttachmentAbsolutePath(storedName);
    fs.mkdirSync(path.dirname(moved), { recursive: true });
    fs.writeFileSync(moved, "ID3");
    db.insert(mediaUploadSessions).values({
      meetingId, userId: host.id, fileName: "a.mp3", mimeType: "audio/mpeg", declaredBytes: 3, reservedBytes: 6, chunkCount: 1,
      consentEvidence: "{}", state: "finalizing", storedName, expiresAt: new Date(Date.now() + 60_000),
    }).run();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await deleteMeeting(meetingId)).toEqual({ ok: true });
    expect(fs.existsSync(moved)).toBe(false);
    // The row survives the failed unlink and is unreachable without its meeting.
    expect(db.select().from(attachments).where(eq(attachments.id, attachment.id)).get()).toMatchObject({ entityId: meetingId });
    expect(attachmentAccessError(host, "meetingRecording", meetingId, "read")).toBe(404);
    fs.rmSync(file, { recursive: true, force: true });
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    sweepOrphanedMedia({ now: Date.now() + 2 * 24 * 60 * 60_000 });
    expect(db.select().from(attachments).all()).toEqual([]);
  });
});

describe("failed uploads", () => {
  function failedUpload(userId: string, updatedAt = new Date()) {
    return db.insert(mediaUploadSessions).values({
      meetingId, userId, fileName: "a.mp3", mimeType: "audio/mpeg", declaredBytes: 3, reservedBytes: 6, chunkCount: 1,
      consentEvidence: "{}", state: "aborted", error: "Upload expired", expiresAt: new Date(), updatedAt,
    }).returning().get();
  }

  it("lists failed uploads for a week and lets the uploader or a host dismiss them", async () => {
    const mine = failedUpload(member.id);
    const others = failedUpload(host.id);
    failedUpload(member.id, new Date(Date.now() - 8 * 24 * 60 * 60_000));
    expect(getMeetingDetail(member, meetingId)!.uploads.map((upload) => [upload.id, upload.canDismiss]).sort())
      .toEqual([[mine.id, true], [others.id, false]].sort());
    as(member);
    expect(await dismissFailedUpload({ uploadId: others.id })).toEqual({ ok: false, error: "forbidden" });
    expect(await dismissFailedUpload({ uploadId: mine.id })).toEqual({ ok: true });
    as(host);
    expect(await dismissFailedUpload({ uploadId: others.id })).toEqual({ ok: true });
    expect(getMeetingDetail(host, meetingId)!.uploads).toEqual([]);
    as(outsider);
    expect(await dismissFailedUpload({ uploadId: mine.id })).toEqual({ ok: false, error: "notFound" });
    expect(await dismissFailedUpload({ uploadId: "" })).toEqual({ ok: false, error: "invalid" });
  });

  it("does not dismiss an upload that is still in progress", async () => {
    const upload = failedUpload(host.id);
    db.update(mediaUploadSessions).set({ state: "assembling" }).where(eq(mediaUploadSessions.id, upload.id)).run();
    expect(await dismissFailedUpload({ uploadId: upload.id })).toEqual({ ok: false, error: "stale" });
  });
});
