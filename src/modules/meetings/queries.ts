import "server-only";

import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { attachments, projects, tasks, user } from "@/db/schema";
import { meetingFor, visibleMeetingCondition, type MeetingViewer } from "./access";
import { parseProtocolContent } from "./protocol-content";
import {
  mediaUploadSessions,
  meetingAccess,
  meetingActionItemDecisions,
  meetingJobs,
  meetingProtocols,
  meetingRecordings,
  meetings,
  meetingSessionSegments,
  meetingSessionTranscripts,
  meetingSpeakerMaps,
} from "./schema";

export function listMeetings(viewer: MeetingViewer) {
  return db.select({
    id: meetings.id,
    title: meetings.title,
    startsAt: meetings.startsAt,
    status: meetings.status,
    confidential: meetings.confidential,
    aiPolicy: meetings.aiPolicy,
    projectName: projects.name,
    createdAt: meetings.createdAt,
  }).from(meetings)
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .where(visibleMeetingCondition(viewer.id))
    .orderBy(desc(meetings.startsAt), desc(meetings.createdAt))
    .all();
}
export type MeetingListItem = ReturnType<typeof listMeetings>[number];

/** Turns free text into a safe FTS5 query of prefix terms. */
export function ftsQuery(text: string) {
  return text.split(/\s+/).map((term) => term.replace(/["*^:(){}[\]\\]/g, "")).filter((term) => term.length > 1).slice(0, 8)
    .map((term) => `"${term}"*`).join(" ");
}

export type MeetingSearchHit = { meetingId: string; title: string; snippet: string; source: "transcript" | "protocol" };

/** Full-text search in transcripts and approved protocols the viewer may see. */
export function searchMeetings(viewer: MeetingViewer, text: string): MeetingSearchHit[] {
  const query = ftsQuery(text);
  if (!query) return [];
  const rows = sqlite.prepare(`
    SELECT hit.meeting_id AS meetingId, m.title AS title, hit.snippet AS snippet, hit.source AS source FROM (
      SELECT meeting_id, snippet(meeting_protocols_fts, 1, '[', ']', '…', 16) AS snippet, 'protocol' AS source, rank
      FROM meeting_protocols_fts WHERE meeting_protocols_fts MATCH @query
      UNION ALL
      SELECT meeting_id, snippet(meeting_segments_fts, 2, '[', ']', '…', 16) AS snippet, 'transcript' AS source, rank
      FROM meeting_segments_fts WHERE meeting_segments_fts MATCH @query
    ) hit
    JOIN meetings m ON m.id = hit.meeting_id
    JOIN meeting_access a ON a.meeting_id = hit.meeting_id AND a.user_id = @viewer
    ORDER BY hit.rank
    LIMIT 60
  `).all({ query, viewer: viewer.id }) as MeetingSearchHit[];
  // One hit per meeting and source keeps the list readable.
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.meetingId}:${row.source}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function listMeetingFormOptions() {
  return {
    users: db.select({ id: user.id, name: user.name }).from(user).where(isNull(user.removedAt)).orderBy(asc(user.name)).all(),
    projects: db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.status, "active")).orderBy(asc(projects.name)).all(),
  };
}

export function getMeetingDetail(viewer: MeetingViewer, meetingId: string) {
  const access = meetingFor(meetingId, viewer, "view");
  if (!access.ok) return null;
  const meeting = access.meeting;
  const members = db.select({ userId: meetingAccess.userId, role: meetingAccess.role, name: user.name })
    .from(meetingAccess).innerJoin(user, eq(user.id, meetingAccess.userId))
    .where(eq(meetingAccess.meetingId, meeting.id)).orderBy(asc(user.name)).all();
  const recordings = db.select({
    id: meetingRecordings.id,
    sourceRecordingId: meetingRecordings.sourceRecordingId,
    attachmentId: meetingRecordings.attachmentId,
    mimeType: attachments.mimeType,
    kind: meetingRecordings.kind,
    fileName: meetingRecordings.fileName,
    sizeBytes: meetingRecordings.sizeBytes,
    durationMs: meetingRecordings.durationMs,
    expiresAt: meetingRecordings.expiresAt,
    purgeState: meetingRecordings.purgeState,
    createdAt: meetingRecordings.createdAt,
  }).from(meetingRecordings).leftJoin(attachments, eq(attachments.id, meetingRecordings.attachmentId))
    .where(eq(meetingRecordings.meetingId, meeting.id)).orderBy(asc(meetingRecordings.createdAt)).all();
  const jobs = db.select({
    id: meetingJobs.id, stage: meetingJobs.stage, status: meetingJobs.status, recordingId: meetingJobs.recordingId,
    attempts: meetingJobs.attempts, lastError: meetingJobs.lastError, updatedAt: meetingJobs.updatedAt,
  }).from(meetingJobs).where(and(eq(meetingJobs.meetingId, meeting.id), ne(meetingJobs.status, "done")))
    .orderBy(desc(meetingJobs.updatedAt)).limit(30).all();
  const uploads = db.select({
    id: mediaUploadSessions.id, fileName: mediaUploadSessions.fileName, state: mediaUploadSessions.state, error: mediaUploadSessions.error,
  }).from(mediaUploadSessions).where(and(
    eq(mediaUploadSessions.meetingId, meeting.id),
    inArray(mediaUploadSessions.state, ["assembling", "finalizing", "aborted"]),
  )).orderBy(desc(mediaUploadSessions.updatedAt)).limit(10).all();

  const session = db.select().from(meetingSessionTranscripts).where(eq(meetingSessionTranscripts.meetingId, meeting.id))
    .orderBy(desc(meetingSessionTranscripts.revision)).get();
  const speakerMap = session && db.select().from(meetingSpeakerMaps).where(eq(meetingSpeakerMaps.sessionTranscriptId, session.id))
    .orderBy(desc(meetingSpeakerMaps.revision)).get();
  const segments = session
    ? db.select({ id: meetingSessionSegments.id, startMs: meetingSessionSegments.startMs, endMs: meetingSessionSegments.endMs, speakerKey: meetingSessionSegments.speakerKey, text: meetingSessionSegments.text })
      .from(meetingSessionSegments).where(eq(meetingSessionSegments.sessionTranscriptId, session.id)).orderBy(asc(meetingSessionSegments.position)).all()
    : [];

  const protocolRow = (id: string | null) => id ? db.select().from(meetingProtocols).where(eq(meetingProtocols.id, id)).get() : undefined;
  const toProtocol = (row: ReturnType<typeof protocolRow>) => row && {
    id: row.id, version: row.version, source: row.source, model: row.model, createdAt: row.createdAt,
    sessionTranscriptId: row.sessionTranscriptId, content: parseProtocolContent(row.content),
  };
  const current = toProtocol(protocolRow(meeting.currentProtocolId));
  const approved = meeting.approvedProtocolId === meeting.currentProtocolId ? current : toProtocol(protocolRow(meeting.approvedProtocolId));
  // Evidence of a protocol pinned to an older transcript revision.
  const evidenceSegments = (protocol: typeof current) => protocol?.sessionTranscriptId && protocol.sessionTranscriptId !== session?.id
    ? db.select({ id: meetingSessionSegments.id, startMs: meetingSessionSegments.startMs, speakerKey: meetingSessionSegments.speakerKey, text: meetingSessionSegments.text })
      .from(meetingSessionSegments).where(eq(meetingSessionSegments.sessionTranscriptId, protocol.sessionTranscriptId)).all()
    : [];

  const decisions = db.select({
    itemKey: meetingActionItemDecisions.itemKey, status: meetingActionItemDecisions.status, taskId: meetingActionItemDecisions.taskId,
    taskTitle: tasks.title, taskProjectId: tasks.projectId,
  }).from(meetingActionItemDecisions).leftJoin(tasks, eq(tasks.id, meetingActionItemDecisions.taskId))
    .where(eq(meetingActionItemDecisions.meetingId, meeting.id)).all();

  return {
    meeting: {
      id: meeting.id, title: meeting.title, agenda: meeting.agenda, startsAt: meeting.startsAt, status: meeting.status,
      projectId: meeting.projectId, aiPolicy: meeting.aiPolicy, confidential: meeting.confidential, language: meeting.language,
      videoRetentionDays: meeting.videoRetentionDays, audioRetentionDays: meeting.audioRetentionDays,
    },
    role: access.role,
    members,
    recordings,
    jobs,
    uploads,
    transcript: session ? {
      id: session.id,
      revision: session.revision,
      missingInputs: JSON.parse(session.missingInputs) as Array<{ recordingId: string; reason: string }>,
      speakerMapRevision: speakerMap?.revision ?? 0,
      speakerMap: JSON.parse(speakerMap?.map ?? "{}") as Record<string, { userId: string | null; label: string }>,
      segments,
    } : null,
    currentProtocol: current ?? null,
    approvedProtocol: approved ?? null,
    extraEvidence: [...evidenceSegments(current), ...evidenceSegments(approved)],
    decisions,
  };
}
export type MeetingDetail = NonNullable<ReturnType<typeof getMeetingDetail>>;
