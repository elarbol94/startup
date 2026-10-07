"use server";

import { z } from "zod";
import { and, count, desc, eq, like, max } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { fail, revalidateMeeting, type MeetingActionResult } from "./action-helpers";
import { meetingFor } from "./access";
import { enqueueJob } from "./processing/jobs";
import { audit } from "./processing/store";
import { keepKnownEvidence, protocolContentSchema, protocolKeysAreUnique, type ProtocolContent } from "./protocol-content";
import {
  meetingAccess,
  meetingJobs,
  meetingProtocols,
  meetings,
  meetingSessionSegments,
  meetingSessionTranscripts,
  meetingSpeakerMaps,
} from "./schema";

function protocolSearchText(content: ProtocolContent) {
  return [
    content.summary,
    ...content.agendaItems.flatMap((item) => [item.title, item.summary]),
    ...content.decisions.map((item) => item.text),
    ...content.actionItems.map((item) => item.text),
    ...content.openQuestions.map((item) => item.text),
  ].filter(Boolean).join("\n");
}

const saveSchema = z.object({
  meetingId: z.string().min(1),
  /** The version the edit started from; a newer version in between is a conflict. */
  baseProtocolId: z.string().min(1).nullable(),
  content: protocolContentSchema,
});

/** Saves an edit (or a manual protocol) as a new version. */
export async function saveProtocolVersion(input: z.input<typeof saveSchema>): Promise<MeetingActionResult<{ protocolId: string }>> {
  const viewer = await requireUserOrThrow();
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success || !protocolKeysAreUnique(parsed.data.content)) return fail("invalid");
  const access = meetingFor(parsed.data.meetingId, viewer, "contribute");
  if (!access.ok) return fail(access.error);
  const meetingId = access.meeting.id;
  const result = db.transaction((tx) => {
    const meeting = tx.select().from(meetings).where(eq(meetings.id, meetingId)).get()!;
    if ((meeting.currentProtocolId ?? null) !== parsed.data.baseProtocolId) return fail("stale");
    const base = parsed.data.baseProtocolId
      ? tx.select().from(meetingProtocols).where(eq(meetingProtocols.id, parsed.data.baseProtocolId)).get()
      : undefined;
    const sessionTranscriptId = base?.sessionTranscriptId ?? null;
    const segmentIds = new Set(sessionTranscriptId
      ? tx.select({ id: meetingSessionSegments.id }).from(meetingSessionSegments).where(eq(meetingSessionSegments.sessionTranscriptId, sessionTranscriptId)).all().map((row) => row.id)
      : []);
    const content = keepKnownEvidence(parsed.data.content, segmentIds);
    const version = (tx.select({ value: max(meetingProtocols.version) }).from(meetingProtocols).where(eq(meetingProtocols.meetingId, meetingId)).get()?.value ?? 0) + 1;
    const row = tx.insert(meetingProtocols).values({
      meetingId, version, sessionTranscriptId, speakerMapRevision: base?.speakerMapRevision ?? null,
      content: JSON.stringify(content), source: !base || base.source === "manual" ? "manual" : "ai_edited",
      model: base?.model ?? "", promptVersion: base?.promptVersion ?? 0, createdBy: viewer.id,
    }).returning().get();
    tx.update(meetings).set({ currentProtocolId: row.id, status: meeting.approvedProtocolId ? meeting.status : "review", updatedAt: new Date() })
      .where(eq(meetings.id, meetingId)).run();
    audit(tx, meetingId, viewer.id, "protocol.edited", { version });
    return { ok: true as const, protocolId: row.id };
  });
  if (result.ok) revalidateMeeting(meetingId);
  return result;
}

const approveSchema = z.object({ meetingId: z.string().min(1), protocolId: z.string().min(1) });

/** Approves exactly the version the host reviewed; a newer draft makes this fail. */
export async function approveProtocol(input: z.input<typeof approveSchema>): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const access = meetingFor(parsed.data.meetingId, viewer, "manage");
  if (!access.ok) return fail(access.error);
  const meetingId = access.meeting.id;
  const result = db.transaction((tx) => {
    const changed = tx.update(meetings)
      .set({ approvedProtocolId: parsed.data.protocolId, status: "approved", updatedAt: new Date() })
      .where(and(eq(meetings.id, meetingId), eq(meetings.currentProtocolId, parsed.data.protocolId))).run();
    if (changed.changes !== 1) return fail("stale");
    const protocol = tx.select().from(meetingProtocols).where(eq(meetingProtocols.id, parsed.data.protocolId)).get()!;
    sqlite.prepare("DELETE FROM meeting_protocols_fts WHERE meeting_id = ?").run(meetingId);
    sqlite.prepare("INSERT INTO meeting_protocols_fts (meeting_id, text) VALUES (?, ?)")
      .run(meetingId, protocolSearchText(protocolContentSchema.parse(JSON.parse(protocol.content))));
    audit(tx, meetingId, viewer.id, "protocol.approved", { protocolId: protocol.id, version: protocol.version });
    return { ok: true as const };
  });
  if (result.ok) revalidateMeeting(meetingId);
  return result;
}

/** Asks the AI for a new draft from the latest transcript and speaker names. */
export async function regenerateProtocol(meetingId: string): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const access = meetingFor(String(meetingId), viewer, "contribute");
  if (!access.ok) return fail(access.error);
  const meeting = access.meeting;
  if (meeting.aiPolicy !== "openai") return fail("aiDisabled");
  const session = db.select().from(meetingSessionTranscripts).where(eq(meetingSessionTranscripts.meetingId, meeting.id))
    .orderBy(desc(meetingSessionTranscripts.revision)).get();
  if (!session) return fail("notFound");
  db.transaction((tx) => {
    const previous = tx.select({ value: count() }).from(meetingJobs)
      .where(like(meetingJobs.executionKey, `protocol:${session.id}:%`)).get()?.value ?? 0;
    enqueueJob(tx, {
      meetingId: meeting.id, stage: "protocol", transcriptId: session.id, policyRevision: meeting.policyRevision,
      executionKey: `protocol:${session.id}:${previous + 1}`,
    });
    audit(tx, meeting.id, viewer.id, "protocol.regenerateRequested", { sessionTranscriptId: session.id });
  });
  revalidateMeeting(meeting.id);
  return { ok: true };
}

const speakerSchema = z.object({
  sessionTranscriptId: z.string().min(1),
  baseRevision: z.number().int().min(1),
  map: z.record(z.string().max(80), z.object({ userId: z.string().min(1).nullable(), label: z.string().trim().max(120) })),
});

/** Names speakers; a new revision, so protocols pinned to older names keep their evidence. */
export async function saveSpeakerMap(input: z.input<typeof speakerSchema>): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = speakerSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const session = db.select().from(meetingSessionTranscripts).where(eq(meetingSessionTranscripts.id, parsed.data.sessionTranscriptId)).get();
  if (!session) return fail("notFound");
  const access = meetingFor(session.meetingId, viewer, "contribute");
  if (!access.ok) return fail(access.error);
  const members = new Set(db.select({ userId: meetingAccess.userId }).from(meetingAccess).where(eq(meetingAccess.meetingId, session.meetingId)).all().map((row) => row.userId));
  if (Object.values(parsed.data.map).some((entry) => entry.userId && !members.has(entry.userId))) return fail("invalid");
  const result = db.transaction((tx) => {
    const latest = tx.select().from(meetingSpeakerMaps).where(eq(meetingSpeakerMaps.sessionTranscriptId, session.id))
      .orderBy(desc(meetingSpeakerMaps.revision)).get();
    if ((latest?.revision ?? 0) !== parsed.data.baseRevision) return fail("stale");
    tx.insert(meetingSpeakerMaps).values({
      sessionTranscriptId: session.id, revision: parsed.data.baseRevision + 1, map: JSON.stringify(parsed.data.map), createdBy: viewer.id,
    }).run();
    audit(tx, session.meetingId, viewer.id, "speakers.mapped", { sessionTranscriptId: session.id, revision: parsed.data.baseRevision + 1 });
    return { ok: true as const };
  });
  if (result.ok) revalidateMeeting(session.meetingId);
  return result;
}
