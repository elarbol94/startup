"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { requireUserOrThrow } from "@/lib/auth";
import { fail, revalidateMeeting, type MeetingActionResult } from "./action-helpers";
import { canContributeToMeeting, canManageMeeting, meetingFor } from "./access";
import { createCallRoom, createJoinToken, deleteCallRoom, livekitConfig } from "./calls/livekit";
import { endCallSession } from "./calls/recording";
import { audit } from "./processing/store";
import { meetingCallConsents, meetingCallEndpoints, meetingCallSessions } from "./schema";

/** Version of the consent text shown before joining a recorded call. */
const CALL_CONSENT_VERSION = 1;

function openSession(meetingId: string) {
  return db.select().from(meetingCallSessions)
    .where(and(eq(meetingCallSessions.meetingId, meetingId), eq(meetingCallSessions.status, "open"))).get();
}

const startSchema = z.object({ meetingId: z.string().min(1), record: z.boolean() });

/**
 * Opens the meeting's call. Recording is decided here and cannot change
 * during the call: to switch it, end the call and start a new one.
 */
export async function startCall(input: z.input<typeof startSchema>): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  if (!livekitConfig().enabled) return fail("callsDisabled");
  const access = meetingFor(parsed.data.meetingId, viewer, "contribute");
  if (!access.ok) return fail(access.error);
  if (access.meeting.status === "cancelled") return fail("invalid");
  if (openSession(access.meeting.id)) return { ok: true };
  const roomName = `m-${crypto.randomUUID()}`;
  await createCallRoom(roomName);
  const created = db.transaction((tx) => {
    // Two people pressing "start" at once: the second joins the first call.
    if (tx.select({ id: meetingCallSessions.id }).from(meetingCallSessions)
      .where(and(eq(meetingCallSessions.meetingId, access.meeting.id), eq(meetingCallSessions.status, "open"))).get()) return false;
    const session = tx.insert(meetingCallSessions).values({
      meetingId: access.meeting.id, roomName, record: parsed.data.record, aiPolicy: access.meeting.aiPolicy, startedBy: viewer.id,
    }).returning().get();
    audit(tx, access.meeting.id, viewer.id, "call.started", { sessionId: session.id, record: parsed.data.record, aiPolicy: access.meeting.aiPolicy });
    return true;
  }, { behavior: "immediate" });
  if (!created) await deleteCallRoom(roomName);
  revalidateMeeting(access.meeting.id);
  return { ok: true };
}

const joinSchema = z.object({
  meetingId: z.string().min(1),
  consentRecording: z.boolean().default(false),
  consentAi: z.boolean().default(false),
});

/**
 * Admission to the call: a person on the access list gets a 10-minute token
 * for a fresh device identity. For a recorded call the consent is stored
 * first, and without it there is no token.
 */
export async function joinCall(input: z.input<typeof joinSchema>): Promise<MeetingActionResult<{ token: string; serverUrl: string; record: boolean; canPublish: boolean }>> {
  const viewer = await requireUserOrThrow();
  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) return fail("invalid");
  const config = livekitConfig();
  if (!config.enabled) return fail("callsDisabled");
  const access = meetingFor(parsed.data.meetingId, viewer, "view");
  if (!access.ok) return fail(access.error);
  const session = openSession(access.meeting.id);
  if (!session) return fail("noCall");
  const usesAi = session.aiPolicy === "openai";
  if (session.record && (!parsed.data.consentRecording || (usesAi && !parsed.data.consentAi))) return fail("declaration");
  const canPublish = canContributeToMeeting(access.role);
  const identity = `u-${crypto.randomUUID()}`;
  db.transaction((tx) => {
    if (session.record) {
      tx.insert(meetingCallConsents).values({ sessionId: session.id, userId: viewer.id, textVersion: CALL_CONSENT_VERSION, aiProcessing: usesAi })
        .onConflictDoNothing().run();
    }
    tx.insert(meetingCallEndpoints).values({ identity, sessionId: session.id, userId: viewer.id }).run();
    audit(tx, access.meeting.id, viewer.id, "call.joined", { sessionId: session.id, consent: session.record });
  });
  const token = await createJoinToken({ roomName: session.roomName, identity, name: viewer.name, canPublish });
  return { ok: true, token, serverUrl: config.publicUrl, record: session.record, canPublish };
}

/** Ends the call for everyone. Hosts, and whoever started the call, may do this. */
export async function endCall(meetingId: string): Promise<MeetingActionResult> {
  const viewer = await requireUserOrThrow();
  const access = meetingFor(String(meetingId), viewer, "view");
  if (!access.ok) return fail(access.error);
  const session = openSession(access.meeting.id);
  if (!session) return { ok: true };
  if (!canManageMeeting(access.role) && session.startedBy !== viewer.id) return fail("forbidden");
  await endCallSession(session, "endedByHost", viewer.id);
  revalidateMeeting(access.meeting.id);
  return { ok: true };
}
