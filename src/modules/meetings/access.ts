import { and, eq, inArray, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { meetingAccess, meetings } from "./schema";
import type { MeetingAccessRole } from "./constants";

export type MeetingViewer = { id: string; role?: string | null };

/**
 * `meeting_access` is the only source of access to a meeting, its recordings,
 * transcripts and protocols. Admins get no implicit access: meetings can be
 * confidential (personnel talks), and the list is managed by hosts.
 */
export function meetingRole(meetingId: string, viewer: MeetingViewer): MeetingAccessRole | null {
  return db.select({ role: meetingAccess.role }).from(meetingAccess)
    .where(and(eq(meetingAccess.meetingId, meetingId), eq(meetingAccess.userId, viewer.id)))
    .get()?.role ?? null;
}

export const canViewMeeting = (role: MeetingAccessRole | null) => role !== null;
/** Upload, review, edit and decide action items. */
export const canContributeToMeeting = (role: MeetingAccessRole | null) => role === "host" || role === "participant";
/** Settings, access list, AI policy, approval and deletion. */
export const canManageMeeting = (role: MeetingAccessRole | null) => role === "host";

/** SQL condition: meetings the viewer is on the access list of. */
export function visibleMeetingCondition(viewerId: string): SQL {
  return inArray(
    meetings.id,
    db.select({ id: meetingAccess.meetingId }).from(meetingAccess).where(eq(meetingAccess.userId, viewerId)),
  );
}

export type MeetingAccessLevel = "view" | "contribute" | "manage";

/** Loads a meeting for the viewer; a meeting they may not see is reported as missing. */
export function meetingFor(meetingId: string, viewer: MeetingViewer, level: MeetingAccessLevel) {
  const meeting = db.select().from(meetings).where(eq(meetings.id, meetingId)).get();
  const role = meeting ? meetingRole(meetingId, viewer) : null;
  if (!meeting || !canViewMeeting(role)) return { ok: false as const, error: "notFound" as const };
  const allowed = level === "view" || (level === "contribute" ? canContributeToMeeting(role) : canManageMeeting(role));
  return allowed ? { ok: true as const, meeting, role: role! } : { ok: false as const, error: "forbidden" as const };
}
