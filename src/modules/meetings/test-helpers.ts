// Seeding helpers shared by the meetings unit tests. Each test file mocks
// `@/db` with an in-memory database before importing this module.
import { sqlite, db } from "@/db";
import { user } from "@/db/schema";
import { meetingAccess, meetings } from "./schema";
import type { MeetingAccessRole } from "./constants";

export const host = { id: "host", role: "member" };
export const member = { id: "member", role: "member" };
export const outsider = { id: "outsider", role: "admin" };

/** Empties every table (in dependency order) and the FTS indexes. */
export function resetDatabase() {
  sqlite.pragma("foreign_keys = OFF");
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%' AND name NOT LIKE '%_fts_%'").all() as Array<{ name: string }>;
  for (const { name } of tables) sqlite.prepare(`DELETE FROM "${name}"`).run();
  sqlite.pragma("foreign_keys = ON");
  const now = new Date();
  db.insert(user).values([host, member, outsider].map((viewer) => ({
    id: viewer.id, name: viewer.id, email: `${viewer.id}@example.com`, role: viewer.role, createdAt: now, updatedAt: now,
  }))).run();
}

export function seedMeeting(options: { aiPolicy?: "openai" | "none"; members?: Array<[string, MeetingAccessRole]> } = {}) {
  const meeting = db.insert(meetings).values({ title: "Weekly", createdBy: host.id, aiPolicy: options.aiPolicy ?? "openai" }).returning().get();
  db.insert(meetingAccess).values((options.members ?? [[host.id, "host"], [member.id, "participant"]]).map(([userId, role]) => ({ meetingId: meeting.id, userId, role }))).run();
  return meeting;
}
