import "server-only";

import { and, asc, desc, eq, gt, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db, sqlite } from "@/db";
import { attachments, projects, tasks, user } from "@/db/schema";
import { meetingFor, visibleMeetingCondition, type MeetingViewer } from "./access";
import { meetingCallEndpoints } from "./call-schema";
import { parseProtocolContent } from "./protocol-content";
import { livekitConfig } from "./calls/livekit";
import { meetingHasMedia } from "./processing/store";
import { recordingWarnings } from "./recording-warnings";
import {
  mediaUploadSessions,
  meetingCallSessions,
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

/** How long a failed upload is listed on the meeting page. */
export const FAILED_UPLOAD_VISIBLE_MS = 7 * 24 * 60 * 60_000;

/** Separates names in the participant aggregate (ASCII unit separator, never typed into a name). */
const NAME_SEPARATOR = "\u001f";

/**
 * The viewer's meetings with everything the overview shows, aggregated in one
 * statement: protocol state, recordings, open action items, running call and
 * participants.
 */
export function listMeetings(viewer: MeetingViewer) {
  const viewerAccess = alias(meetingAccess, "viewer_access");
  const rows = db.select({
    id: meetings.id,
    title: meetings.title,
    startsAt: meetings.startsAt,
    status: meetings.status,
    confidential: meetings.confidential,
    aiPolicy: meetings.aiPolicy,
    projectName: projects.name,
    createdAt: meetings.createdAt,
    currentProtocolId: meetings.currentProtocolId,
    approvedProtocolId: meetings.approvedProtocolId,
    role: viewerAccess.role,
    recordingCount: sql<number>`(SELECT count(*) FROM ${meetingRecordings}
      WHERE ${meetingRecordings.meetingId} = ${meetings.id} AND ${meetingRecordings.kind} != 'derived_audio')`,
    // Action items of the approved protocol nobody has accepted or rejected yet.
    openActionItems: sql<number>`(SELECT count(*) FROM ${meetingProtocols}, json_each(${meetingProtocols.content}, '$.actionItems') AS item
      WHERE ${meetingProtocols.id} = ${meetings.approvedProtocolId}
      AND NOT EXISTS (SELECT 1 FROM ${meetingActionItemDecisions}
        WHERE ${meetingActionItemDecisions.meetingId} = ${meetings.id}
        AND ${meetingActionItemDecisions.itemKey} = json_extract(item.value, '$.itemKey')))`,
    callOpen: sql<number>`EXISTS (SELECT 1 FROM ${meetingCallSessions}
      WHERE ${meetingCallSessions.meetingId} = ${meetings.id} AND ${meetingCallSessions.status} = 'open')`,
    participantNames: sql<string | null>`(SELECT group_concat(${user.name}, ${NAME_SEPARATOR}) FROM ${meetingAccess}
      JOIN ${user} ON ${user.id} = ${meetingAccess.userId} WHERE ${meetingAccess.meetingId} = ${meetings.id})`,
  }).from(meetings)
    // The viewer's own access row: the role for the "I am host" filter.
    .innerJoin(viewerAccess, and(eq(viewerAccess.meetingId, meetings.id), eq(viewerAccess.userId, viewer.id)))
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .where(visibleMeetingCondition(viewer.id))
    .orderBy(desc(meetings.startsAt), desc(meetings.createdAt))
    .all();
  return rows.map(({ currentProtocolId, approvedProtocolId, participantNames, callOpen, ...row }) => ({
    ...row,
    protocolState: !currentProtocolId ? "none" as const : currentProtocolId === approvedProtocolId ? "approved" as const : "draft" as const,
    callOpen: Boolean(callOpen),
    participants: (participantNames ? participantNames.split(NAME_SEPARATOR) : []).sort((a, b) => a.localeCompare(b)),
  }));
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

type SpeakerMap = Record<string, { userId: string | null; label: string }>;

export function getMeetingDetail(viewer: MeetingViewer, meetingId: string) {
  const access = meetingFor(meetingId, viewer, "view");
  if (!access.ok) return null;
  const meeting = access.meeting;
  const members = db.select({ userId: meetingAccess.userId, role: meetingAccess.role, name: user.name })
    .from(meetingAccess).innerJoin(user, eq(user.id, meetingAccess.userId))
    .where(eq(meetingAccess.meetingId, meeting.id)).orderBy(asc(user.name)).all();
  const recordingRows = db.select({
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
    source: meetingRecordings.source,
    mediaStartedAt: meetingRecordings.mediaStartedAt,
    callSessionId: meetingRecordings.callSessionId,
    /** The person whose microphone a call track holds. */
    speakerUserId: meetingRecordings.speakerUserId,
    speakerName: user.name,
  }).from(meetingRecordings).leftJoin(attachments, eq(attachments.id, meetingRecordings.attachmentId))
    .leftJoin(user, eq(user.id, meetingRecordings.speakerUserId))
    .where(eq(meetingRecordings.meetingId, meeting.id)).orderBy(asc(meetingRecordings.createdAt)).all();
  const jobs = db.select({
    id: meetingJobs.id, stage: meetingJobs.stage, status: meetingJobs.status, recordingId: meetingJobs.recordingId,
    attempts: meetingJobs.attempts, lastError: meetingJobs.lastError, updatedAt: meetingJobs.updatedAt,
  }).from(meetingJobs).where(and(eq(meetingJobs.meetingId, meeting.id), ne(meetingJobs.status, "done")))
    .orderBy(desc(meetingJobs.updatedAt)).limit(30).all();
  const uploads = db.select({
    id: mediaUploadSessions.id, fileName: mediaUploadSessions.fileName, state: mediaUploadSessions.state, error: mediaUploadSessions.error,
    userId: mediaUploadSessions.userId,
  }).from(mediaUploadSessions).where(and(
    eq(mediaUploadSessions.meetingId, meeting.id),
    or(
      inArray(mediaUploadSessions.state, ["assembling", "finalizing"]),
      // Failed uploads stay visible for a week unless dismissed.
      and(eq(mediaUploadSessions.state, "aborted"), isNull(mediaUploadSessions.dismissedAt), gt(mediaUploadSessions.updatedAt, new Date(Date.now() - FAILED_UPLOAD_VISIBLE_MS))),
    ),
  )).orderBy(desc(mediaUploadSessions.updatedAt)).limit(10).all()
    .map(({ userId, ...upload }) => ({ ...upload, canDismiss: userId === viewer.id || access.role === "host" }));

  const session = db.select().from(meetingSessionTranscripts).where(eq(meetingSessionTranscripts.meetingId, meeting.id))
    .orderBy(desc(meetingSessionTranscripts.revision)).get();
  const speakerMap = session && db.select().from(meetingSpeakerMaps).where(eq(meetingSpeakerMaps.sessionTranscriptId, session.id))
    .orderBy(desc(meetingSpeakerMaps.revision)).get();
  const segments = session
    ? db.select({ id: meetingSessionSegments.id, startMs: meetingSessionSegments.startMs, endMs: meetingSessionSegments.endMs, speakerKey: meetingSessionSegments.speakerKey, text: meetingSessionSegments.text })
      .from(meetingSessionSegments).where(eq(meetingSessionSegments.sessionTranscriptId, session.id)).orderBy(asc(meetingSessionSegments.position)).all()
    : [];

  const manifest = JSON.parse(session?.inputManifest ?? "[]") as Array<{ recordingId: string }>;
  // Call tracks hold one known person each: their speaker key is named from the recording, never by hand.
  const fixedSpeakers: SpeakerMap = {};
  manifest.forEach((input, index) => {
    const original = recordingRows.find((recording) => recording.id === input.recordingId);
    if (original?.speakerUserId && original.speakerName) fixedSpeakers[`r${index + 1}:speaker`] = { userId: original.speakerUserId, label: original.speakerName };
  });
  const textsByRecording = new Map<string, string[]>();
  for (const segment of segments) {
    const recordingId = manifest[Number(/^r(\d+):/.exec(segment.speakerKey)?.[1] ?? 0) - 1]?.recordingId;
    if (recordingId) textsByRecording.set(recordingId, [...(textsByRecording.get(recordingId) ?? []), segment.text]);
  }
  const callLengths = new Map(db.select({ id: meetingCallSessions.id, startedAt: meetingCallSessions.startedAt, endedAt: meetingCallSessions.endedAt })
    .from(meetingCallSessions).where(eq(meetingCallSessions.meetingId, meeting.id)).all()
    .map((call) => [call.id, call.endedAt ? call.endedAt.getTime() - call.startedAt.getTime() : null]));
  const recordings = recordingRows.map((recording) => ({
    ...recording,
    warnings: recording.kind === "derived_audio" ? [] : recordingWarnings({
      durationMs: recording.durationMs,
      callMs: recording.callSessionId ? callLengths.get(recording.callSessionId) ?? null : null,
      otherTrackMs: recording.callSessionId
        ? recordingRows.filter((other) => other.callSessionId === recording.callSessionId && other.kind !== "derived_audio" && other.id !== recording.id)
          .map((other) => other.durationMs ?? 0)
        : [],
      texts: textsByRecording.get(recording.id) ?? [],
      meetingLanguage: meeting.language,
    }),
  }));

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

  const openCall = db.select().from(meetingCallSessions)
    .where(and(eq(meetingCallSessions.meetingId, meeting.id), eq(meetingCallSessions.status, "open"))).get();
  // Who received a join token for the open call, and when first. This is not
  // live presence: leaving the call leaves no trace here.
  const callJoined = openCall ? db.select({
    userId: meetingCallEndpoints.userId,
    name: user.name,
    joinedAt: sql<number>`min(${meetingCallEndpoints.createdAt})`,
  }).from(meetingCallEndpoints).innerJoin(user, eq(user.id, meetingCallEndpoints.userId))
    .where(eq(meetingCallEndpoints.sessionId, openCall.id))
    .groupBy(meetingCallEndpoints.userId, user.name).orderBy(sql`min(${meetingCallEndpoints.createdAt})`).all() : [];

  return {
    calls: {
      enabled: livekitConfig().enabled,
      open: openCall ? {
        record: openCall.record, startedAt: openCall.startedAt, startedBy: openCall.startedBy,
        joined: callJoined.map((entry) => ({ ...entry, joinedAt: new Date(entry.joinedAt) })),
      } : null,
    },
    meeting: {
      id: meeting.id, title: meeting.title, agenda: meeting.agenda, startsAt: meeting.startsAt, status: meeting.status,
      projectId: meeting.projectId, aiPolicy: meeting.aiPolicy, confidential: meeting.confidential, language: meeting.language,
      videoRetentionDays: meeting.videoRetentionDays, audioRetentionDays: meeting.audioRetentionDays,
    },
    role: access.role,
    members,
    recordings,
    /** Media whose consent was given under the current AI setting, including uploads and call recordings still arriving. */
    hasMedia: meetingHasMedia(db, meeting.id),
    jobs,
    uploads,
    transcript: session ? {
      id: session.id,
      revision: session.revision,
      missingInputs: JSON.parse(session.missingInputs) as Array<{ recordingId: string; reason: string }>,
      speakerMapRevision: speakerMap?.revision ?? 0,
      speakerMap: { ...JSON.parse(speakerMap?.map ?? "{}") as SpeakerMap, ...fixedSpeakers },
      /** Speakers of call tracks: named automatically, not offered for naming. */
      fixedSpeakerKeys: Object.keys(fixedSpeakers),
      segments,
    } : null,
    currentProtocol: current ?? null,
    approvedProtocol: approved ?? null,
    extraEvidence: [...evidenceSegments(current), ...evidenceSegments(approved)],
    decisions,
  };
}
export type MeetingDetail = NonNullable<ReturnType<typeof getMeetingDetail>>;
