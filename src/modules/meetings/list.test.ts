import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

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

import { db } from "@/db";
import { matchesFilter } from "./components/meetings-list/list-filters";
import { emptyProtocol } from "./protocol-content";
import { getMeetingDetail, listMeetings } from "./queries";
import {
  meetingActionItemDecisions,
  meetingCallEndpoints,
  meetingCallSessions,
  meetingProtocols,
  meetingRecordings,
  meetings,
} from "./schema";
import { host, member, outsider, resetDatabase, seedMeeting } from "./test-helpers";

function approveWithItems(meetingId: string, itemKeys: string[]) {
  const content = { ...emptyProtocol(), actionItems: itemKeys.map((itemKey) => ({ itemKey, text: itemKey, assigneeUserId: null, dueDate: null, evidence: [] })) };
  const protocol = db.insert(meetingProtocols).values({ meetingId, version: 1, content: JSON.stringify(content), source: "manual" }).returning().get();
  db.update(meetings).set({ currentProtocolId: protocol.id, approvedProtocolId: protocol.id, status: "approved" }).where(eq(meetings.id, meetingId)).run();
  return protocol;
}

beforeEach(() => resetDatabase());

describe("meeting overview", () => {
  it("aggregates protocol, recordings, open action items, call and participants per meeting", () => {
    const busy = seedMeeting();
    const quiet = seedMeeting({ members: [[member.id, "host"], [host.id, "viewer"]] });
    seedMeeting({ members: [[outsider.id, "host"]] });

    const protocol = approveWithItems(busy.id, ["a", "b", "c"]);
    db.insert(meetingActionItemDecisions).values({ meetingId: busy.id, itemKey: "b", protocolId: protocol.id, snapshot: "{}", status: "rejected", decidedBy: host.id }).run();
    const original = db.insert(meetingRecordings).values({ meetingId: busy.id, kind: "audio", createdBy: host.id }).returning().get();
    db.insert(meetingRecordings).values({ meetingId: busy.id, kind: "derived_audio", sourceRecordingId: original.id, createdBy: host.id }).run();
    db.insert(meetingCallSessions).values({ meetingId: busy.id, roomName: "room-1", record: false, aiPolicy: "openai", startedBy: host.id }).run();

    const rows = listMeetings(host);
    expect(rows).toHaveLength(2);
    const busyRow = rows.find((row) => row.id === busy.id)!;
    expect(busyRow).toMatchObject({ protocolState: "approved", recordingCount: 1, openActionItems: 2, callOpen: true, role: "host", participants: ["host", "member"] });
    const quietRow = rows.find((row) => row.id === quiet.id)!;
    expect(quietRow).toMatchObject({ protocolState: "none", recordingCount: 0, openActionItems: 0, callOpen: false, role: "viewer" });

    expect(matchesFilter(busyRow, "call")).toBe(true);
    expect(matchesFilter(quietRow, "host")).toBe(false);
    expect(matchesFilter(busyRow, "review")).toBe(false);
  });

  it("marks a newer unapproved version as a draft that needs review", () => {
    const meeting = seedMeeting();
    approveWithItems(meeting.id, []);
    const draft = db.insert(meetingProtocols).values({ meetingId: meeting.id, version: 2, content: JSON.stringify(emptyProtocol()), source: "manual" }).returning().get();
    db.update(meetings).set({ currentProtocolId: draft.id }).where(eq(meetings.id, meeting.id)).run();
    const [row] = listMeetings(host);
    expect(row.protocolState).toBe("draft");
    expect(matchesFilter(row, "review")).toBe(true);
  });

  it("lists who joined the open call, once per person with their first join", () => {
    const meeting = seedMeeting();
    const session = db.insert(meetingCallSessions).values({ meetingId: meeting.id, roomName: "room-2", record: true, aiPolicy: "openai", startedBy: host.id }).returning().get();
    db.insert(meetingCallEndpoints).values([
      { identity: "host-laptop", sessionId: session.id, userId: host.id, createdAt: new Date(1_000) },
      { identity: "member-phone", sessionId: session.id, userId: member.id, createdAt: new Date(2_000) },
      { identity: "host-phone", sessionId: session.id, userId: host.id, createdAt: new Date(3_000) },
    ]).run();
    const joined = getMeetingDetail(host, meeting.id)!.calls.open!.joined;
    expect(joined.map((entry) => [entry.name, entry.joinedAt.getTime()])).toEqual([["host", 1_000], ["member", 2_000]]);
  });
});
